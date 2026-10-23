"""Core logic tests (no Qt). Run: python -m unittest discover -s tests"""

import json
import tempfile
import unittest
from pathlib import Path

from movienight.ai import AIError, suggest_movies
from movienight.ai.base import parse_json_array
from movienight.models import (
    KID_YES_ME_NO,
    LATER,
    NO,
    SEEN_LIKED,
    SUPER,
    WANT,
    title_key,
    validate_and_dedupe,
)
from movienight.prompts import PromptStore
from movienight.state import DeckState
from movienight.storage import JsonFileStorage, MemoryStorage


def good_item(title="Some Lesser Known Film", year=2021):
    return {"title": title, "year": year, "emoji": "🎈", "desc_lt": "Aprašymas.",
            "why_lt": "Tinka.", "kid_note_lt": "Nebaisu."}


class FakeProvider:
    id = "fake"
    label = "Fake"

    def __init__(self, reply):
        self.reply = reply
        self.prompts = None

    def complete(self, system, user, log):
        self.prompts = (system, user)
        return self.reply


class StateTests(unittest.TestCase):
    def setUp(self):
        self.storage = MemoryStorage()
        self.state = DeckState(self.storage)

    def test_seed_loaded_and_persisted(self):
        self.assertEqual(len(self.state.queue), 27)
        self.assertEqual(self.state.top.title, "Klaus")
        self.assertEqual(len(self.storage.document["queue"]), 27)

    def test_rate_and_undo(self):
        top = self.state.top
        self.assertIsNotNone(self.state.rate(top.key, SUPER))
        self.assertEqual(self.state.by_verdict(SUPER)[0].title, "Klaus")
        self.assertNotEqual(self.state.top.key, top.key)
        self.assertEqual(self.state.undo(), "Klaus")
        self.assertEqual(self.state.top.key, top.key)
        self.assertEqual(self.state.ratings, [])

    def test_rate_ignores_stale_key(self):
        self.assertIsNone(self.state.rate("not-the-top", WANT))
        self.assertIsNone(self.state.rate(self.state.top.key, "bogus"))

    def test_later_requeues_and_undo(self):
        first = self.state.top
        self.state.rate(first.key, LATER)
        self.assertEqual(self.state.queue[5].key, first.key)
        self.assertEqual(self.state.ratings, [])
        self.state.undo()
        self.assertEqual(self.state.top.key, first.key)
        self.assertEqual(len(self.state.queue), 27)

    def test_remove_change_and_undo(self):
        key = self.state.top.key
        self.state.rate(key, WANT)
        self.state.change_verdict(key, KID_YES_ME_NO)
        self.assertEqual(self.state.ratings[0]["verdict"], KID_YES_ME_NO)
        self.state.remove_rating(key)
        self.assertEqual(self.state.ratings, [])
        self.state.undo()
        self.assertEqual(self.state.ratings[0]["verdict"], KID_YES_ME_NO)
        self.state.undo()
        self.assertEqual(self.state.ratings[0]["verdict"], WANT)

    def test_needs_refill(self):
        verdicts = [NO, WANT, SEEN_LIKED, SUPER]
        while len(self.state.queue) > 4:
            self.state.rate(self.state.top.key, verdicts[len(self.state.ratings) % 4])
        self.assertTrue(self.state.needs_refill())

    def test_append_dedupes(self):
        movies, _ = validate_and_dedupe([good_item()], set(), "fake")
        self.assertEqual(len(self.state.append_movies(movies)), 1)
        self.assertEqual(self.state.append_movies(movies), [])

    def test_reset(self):
        self.state.rate(self.state.top.key, NO)
        self.state.set_imdb_id("klaus", "tt4729430")
        self.state.reset()
        self.assertEqual(self.state.ratings, [])
        self.assertEqual(len(self.state.queue), 27)
        self.assertEqual(self.state.imdb_ids["klaus"], "tt4729430")

    def test_json_file_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data.json"
            state = DeckState(JsonFileStorage(path))
            state.rate(state.top.key, SEEN_LIKED)
            again = DeckState(JsonFileStorage(path))
            self.assertEqual(again.ratings[0]["verdict"], SEEN_LIKED)
            self.assertEqual(len(again.queue), 26)
            self.assertIn("klaus", json.loads(path.read_text(encoding="utf-8"))["shown"])


class ValidationTests(unittest.TestCase):
    def test_title_key(self):
        self.assertEqual(title_key("The Wild Robot"), title_key("wild robot!"))
        self.assertEqual(title_key("Wallace & Gromit"), title_key("Wallace and Gromit"))

    def test_rules(self):
        items = [
            good_item("Old Film", 2010),
            good_item("Klaus", 2019),
            {"title": "", "year": 2020},
            good_item("Fine", "2022"),
            good_item("Fine", 2022),
            "nonsense",
        ]
        movies, problems = validate_and_dedupe(items, {"klaus"}, "fake")
        self.assertEqual([m.title for m in movies], ["Fine"])
        self.assertEqual(len(problems), 5)

    def test_parse_json_variants(self):
        self.assertEqual(parse_json_array('```json\n[{"a":1}]\n```'), [{"a": 1}])
        self.assertEqual(parse_json_array('Štai: [{"a":1}] ačiū'), [{"a": 1}])
        self.assertEqual(parse_json_array('{"movies": [{"a":1}]}'), [{"a": 1}])
        with self.assertRaises(AIError):
            parse_json_array("no json here")


class PipelineTests(unittest.TestCase):
    def test_suggest_movies_end_to_end(self):
        state = DeckState(MemoryStorage())
        state.rate(state.top.key, SUPER)
        with tempfile.TemporaryDirectory() as tmp:
            prompts = PromptStore(Path(tmp) / "prompts.json")
            reply = json.dumps([good_item("Klaus", 2019), good_item("New One", 2023)])
            provider = FakeProvider(reply)
            movies = suggest_movies(provider, prompts, state.ai_context(), state.known_keys(),
                                    lambda _: None, extra_request="apie dinozaurus")
        self.assertEqual([m.title for m in movies], ["New One"])
        system, user = provider.prompts
        self.assertIn("Klaus (2019)", user)  # in LOVED and in the shown list
        self.assertIn("apie dinozaurus", user)
        self.assertNotIn("$", user)

    def test_all_duplicates_is_error(self):
        state = DeckState(MemoryStorage())
        with tempfile.TemporaryDirectory() as tmp:
            prompts = PromptStore(Path(tmp) / "p.json")
            with self.assertRaises(AIError):
                suggest_movies(FakeProvider(json.dumps([good_item("Luca", 2021)])), prompts,
                               state.ai_context(), state.known_keys(), lambda _: None)

    def test_prompt_store_persists(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "p.json"
            store = PromptStore(path)
            store.user = "Liked: $liked {json braces stay}"
            store.count = 5
            store.save()
            again = PromptStore(path)
            _, user = again.render({"liked": ["A (2020)"]})
            self.assertEqual(user, "Liked: A (2020) {json braces stay}")
            self.assertEqual(again.count, 5)


if __name__ == "__main__":
    unittest.main()
