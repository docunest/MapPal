"""Nustatymai: AI provider, keys (OS keyring) and editable prompts."""

from __future__ import annotations

import shutil
import subprocess

from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QSpinBox,
    QStackedWidget,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..prompts import DEFAULT_SYSTEM, DEFAULT_USER, PLACEHOLDERS, PromptStore
from ..settings import PROVIDERS, KeyStoreError, Settings, get_api_key, key_from_env, set_api_key

EFFORTS = ["low", "medium", "high"]


class SettingsDialog(QDialog):
    def __init__(self, settings: Settings, prompts: PromptStore, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Nustatymai")
        self.resize(760, 640)
        self.settings = settings
        self.prompts = prompts

        tabs = QTabWidget(self)
        tabs.addTab(self._provider_tab(), "AI teikėjas")
        tabs.addTab(self._prompts_tab(), "Užklausos")

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel, self
        )
        buttons.button(QDialogButtonBox.StandardButton.Save).setText("Išsaugoti")
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setText("Atšaukti")
        buttons.accepted.connect(self._save)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.addWidget(tabs, 1)
        layout.addWidget(buttons)

    # ---- provider tab ------------------------------------------------
    def _key_field(self, provider: str) -> QLineEdit:
        field = QLineEdit(self)
        field.setEchoMode(QLineEdit.EchoMode.Password)
        env_var = PROVIDERS[provider][1]
        if key_from_env(provider):
            field.setPlaceholderText(f"naudojamas {env_var} aplinkos kintamasis")
        elif get_api_key(provider):
            field.setPlaceholderText("išsaugotas OS raktų saugykloje – palikite tuščią")
        else:
            field.setPlaceholderText("įklijuokite raktą (saugomas OS raktų saugykloje)")
        return field

    def _provider_tab(self) -> QWidget:
        page = QWidget(self)
        s = self.settings

        self.provider_combo = QComboBox(page)
        for pid, (label, _) in PROVIDERS.items():
            self.provider_combo.addItem(label, pid)
        self.provider_combo.setCurrentIndex(list(PROVIDERS).index(s.provider))

        self.stack = QStackedWidget(page)

        # Anthropic SDK
        box = QGroupBox("Claude API (anthropic SDK)")
        form = QFormLayout(box)
        self.anthropic_key = self._key_field("anthropic")
        self.anthropic_model = QLineEdit(s.anthropic_model)
        self.anthropic_effort = QComboBox()
        self.anthropic_effort.addItems(EFFORTS)
        self.anthropic_effort.setCurrentText(s.anthropic_effort)
        form.addRow("API raktas:", self.anthropic_key)
        form.addRow("Modelis:", self.anthropic_model)
        form.addRow("Pastangos (effort):", self.anthropic_effort)
        form.addRow(QLabel("Raktą gausite https://platform.claude.com → API Keys."))
        self.stack.addWidget(box)

        # Claude Code CLI
        box = QGroupBox("Claude Code terminalas")
        form = QFormLayout(box)
        self.cli_path = QLineEdit(s.claude_cli_path)
        self.cli_model = QLineEdit(s.claude_cli_model)
        test_btn = QPushButton("Patikrinti")
        test_btn.clicked.connect(self._test_cli)
        row = QHBoxLayout()
        row.addWidget(self.cli_path, 1)
        row.addWidget(test_btn)
        form.addRow("Komanda / kelias:", row)
        form.addRow("Modelis:", self.cli_model)
        info = QLabel(
            "Naudoja jūsų kompiuteryje įdiegtą <code>claude</code> komandą ir jos prisijungimą "
            "(Claude Pro/Max arba API raktą). Visa eiga matoma skirtuke „AI terminalas“."
        )
        info.setWordWrap(True)
        form.addRow(info)
        self.stack.addWidget(box)

        # DeepSeek
        box = QGroupBox("DeepSeek API")
        form = QFormLayout(box)
        self.deepseek_key = self._key_field("deepseek")
        self.deepseek_model = QLineEdit(s.deepseek_model)
        self.deepseek_url = QLineEdit(s.deepseek_base_url)
        form.addRow("API raktas:", self.deepseek_key)
        form.addRow("Modelis:", self.deepseek_model)
        form.addRow("API adresas:", self.deepseek_url)
        self.stack.addWidget(box)

        self.provider_combo.currentIndexChanged.connect(self.stack.setCurrentIndex)
        self.stack.setCurrentIndex(self.provider_combo.currentIndex())

        self.auto_refill = QCheckBox(
            "Automatiškai prašyti naujų filmų, kai liko ≤4 kortelės (po 4+ įvertinimų)"
        )
        self.auto_refill.setChecked(s.auto_refill)

        layout = QVBoxLayout(page)
        top = QFormLayout()
        top.addRow("Rekomendacijų teikėjas:", self.provider_combo)
        layout.addLayout(top)
        layout.addWidget(self.stack)
        layout.addWidget(self.auto_refill)
        layout.addStretch(1)
        return page

    def _test_cli(self) -> None:
        exe = shutil.which(self.cli_path.text().strip() or "claude")
        if not exe:
            QMessageBox.warning(self, "Claude Code", "Komanda nerasta. Įdiekite Claude Code arba "
                                "nurodykite pilną kelią.")
            return
        try:
            out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=20)
            QMessageBox.information(self, "Claude Code", f"Rasta: {exe}\n{out.stdout.strip()}")
        except (OSError, subprocess.SubprocessError) as exc:
            QMessageBox.warning(self, "Claude Code", f"Nepavyko paleisti: {exc}")

    # ---- prompts tab -------------------------------------------------
    def _prompts_tab(self) -> QWidget:
        page = QWidget(self)
        self.system_edit = QPlainTextEdit(self.prompts.system)
        self.system_edit.setMaximumHeight(110)
        self.user_edit = QPlainTextEdit(self.prompts.user)
        self.count_spin = QSpinBox()
        self.count_spin.setRange(1, 20)
        self.count_spin.setValue(self.prompts.count)

        legend = QLabel(
            "Kintamieji: " + ", ".join(f"<code>${k}</code> – {v}" for k, v in PLACEHOLDERS.items())
        )
        legend.setWordWrap(True)
        reset_btn = QPushButton("Atstatyti numatytąsias")
        reset_btn.clicked.connect(self._reset_prompts)

        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("<b>Sistemos užklausa</b> (kas yra AI):"))
        layout.addWidget(self.system_edit)
        layout.addWidget(QLabel("<b>Užklausa</b> (taisyklės ir atsakymo formatas):"))
        layout.addWidget(self.user_edit, 1)
        layout.addWidget(legend)
        row = QHBoxLayout()
        row.addWidget(QLabel("Kiek filmų prašyti kartą:"))
        row.addWidget(self.count_spin)
        row.addStretch(1)
        row.addWidget(reset_btn)
        layout.addLayout(row)
        return page

    def _reset_prompts(self) -> None:
        self.system_edit.setPlainText(DEFAULT_SYSTEM)
        self.user_edit.setPlainText(DEFAULT_USER)
        self.count_spin.setValue(8)

    # ---- save --------------------------------------------------------
    def _save(self) -> None:
        s = self.settings
        s.provider = self.provider_combo.currentData()
        s.anthropic_model = self.anthropic_model.text().strip() or "claude-sonnet-5-5"
        s.anthropic_effort = self.anthropic_effort.currentText()
        s.claude_cli_path = self.cli_path.text().strip() or "claude"
        s.claude_cli_model = self.cli_model.text().strip()
        s.deepseek_model = self.deepseek_model.text().strip() or "deepseek-chat"
        s.deepseek_base_url = self.deepseek_url.text().strip() or "https://api.deepseek.com"
        s.auto_refill = self.auto_refill.isChecked()

        self.prompts.system = self.system_edit.toPlainText().strip() or DEFAULT_SYSTEM
        self.prompts.user = self.user_edit.toPlainText().strip() or DEFAULT_USER
        self.prompts.count = self.count_spin.value()

        for provider, field in (("anthropic", self.anthropic_key), ("deepseek", self.deepseek_key)):
            key = field.text().strip()
            if key:
                try:
                    set_api_key(provider, key)
                except KeyStoreError as exc:
                    QMessageBox.warning(self, "Raktų saugykla", str(exc))
                    return
        self.accept()
