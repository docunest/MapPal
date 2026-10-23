"""Starting deck. Edit freely – it is only used on first run and on "Pradėti iš naujo"."""

from __future__ import annotations

from .models import Movie

_SEED: list[tuple[str, int, str, str, str, str]] = [
    # (title, year, emoji, desc_lt, why_lt, kid_note_lt)
    (
        "Klaus", 2019, "🎅",
        "Išlepintas pašto tarnautojas Jesperis ištremiamas į atšiaurią šiaurės salą, kur "
        "susidraugauja su vienišu žaislų meistru Klausu.",
        "Šilta, juokinga istorija apie tai, kaip vienas geras darbas užkrečia kitus – "
        "patiks ir paaugliams, ir tėvams.",
        "Pradžioje salos gyventojai pikti ir triukšmingi, bet nieko baisaus.",
    ),
    (
        "The Amazing Maurice", 2022, "🐱",
        "Pagal T. Pratchetto knygą: gudrus katinas Morisas ir kalbančios žiurkės "
        "apgaudinėja miestelius, kol susiduria su tikru piktadariu.",
        "Sąmojingas, šiek tiek ironiškas pasakojimas – paaugliams patiks humoras, "
        "mažiesiems – kalbantys gyvūnai.",
        "Žiurkių urvų scenos ir „Žiurkių karalius“ gali būti baugoki – geriau žiūrėti šalia.",
    ),
    (
        "Orion and the Dark", 2024, "🌙",
        "Berniukas Orionas bijo beveik visko, ypač tamsos, kol pati Tamsa pasikviečia "
        "jį į naktinę kelionę aplink pasaulį.",
        "Išradinga, filosofiška ir juokinga – scenarijus Charlie Kaufmano, todėl įdomu "
        "ir suaugusiems.",
        "Puikiai tinka vaikui, kuris bijo tamsos; keli trumpi įtempti momentai.",
    ),
    (
        "The Sea Beast", 2022, "🐉",
        "Mergaitė Meizė įsiprašo į legendinio jūrų pabaisų medžiotojo laivą ir atranda, "
        "kad pabaisos visai ne tokios, kokias jas vaizduoja knygos.",
        "Didingas nuotykis su laivais, audromis ir draugyste – kaip piratų filmas visai šeimai.",
        "Kelios garsios jūros mūšių scenos; didžioji pabaisa greitai tampa miela.",
    ),
    (
        "My Father's Dragon", 2022, "🐲",
        "Berniukas Elmeris pabėga į Laukinę salą, kad išgelbėtų pririštą drakoną Borį "
        "ir padėtų savo mamai.",
        "Ranka pieštas „Cartoon Saloon“ grožis ir švelni istorija apie drąsą.",
        "Švelnus nuotykis; salos gyvūnai iš pradžių atrodo grėsmingi, bet tai trumpam.",
    ),
    (
        "Wolfwalkers", 2020, "🐺",
        "Airija, 1650 m.: jauna medžiotoja Robina susidraugauja su mergaite Mebe, kuri "
        "miegodama virsta vilku.",
        "Vienas gražiausių pastarųjų metų animacinių filmų – stipri istorija paaugliams, "
        "įspūdinga ir tėvams.",
        "Miesto valdytojas, gaisras ir vilkų medžioklė gali išgąsdinti – žiūrėkit kartu.",
    ),
    (
        "Kensuke's Kingdom", 2023, "🏝️",
        "Berniukas Maiklas su šunimi Stela atsiduria negyvenamoje saloje, kurioje "
        "slapta gyvena senas japonas Kensukė.",
        "Ramus, gražus išgyvenimo nuotykis pagal M. Morpurgo knygą – mažiau žinomas perlas.",
        "Yra liūdnų akimirkų (prisiminimai apie karą), bet baisių scenų nėra.",
    ),
    (
        "Over the Moon", 2020, "🚀",
        "Mergaitė Fei Fei pasistato raketą, kad įrodytų, jog Mėnulio deivė Čang E "
        "tikrai egzistuoja.",
        "Spalvingas miuziklas su smagiomis dainomis ir šiltu pasakojimu apie šeimą.",
        "Daug dainų ir spalvų; liūdnoka tema apie mamos netektį.",
    ),
    (
        "Wish Dragon", 2021, "🫖",
        "Šanchajaus studentas Dinas randa seną arbatinuką su norus pildančiu drakonu "
        "Longu ir nori susigrąžinti vaikystės draugę.",
        "Smagi šiuolaikinė „Aladino“ versija su daug humoro.",
        "Linksmas; keli komiški muštynių epizodai.",
    ),
    (
        "Wallace & Gromit: Vengeance Most Fowl", 2024, "🐧",
        "Volesas sukuria „protingą“ sodo nykštuką, o iš kalėjimo grįžta pingvinas "
        "Makgrou su keršto planu.",
        "Britiškas plastilino humoras, kurį vienodai mėgsta ir tėvai, ir vaikai.",
        "Pingvinas piktadarys labiau juokingas nei baisus; finale smagus vaikymasis.",
    ),
    (
        "Chicken Run: Dawn of the Nugget", 2023, "🐔",
        "Džindžer ir Rokis ramiai gyvena saloje, kol jų dukra Moli patenka į įtartiną "
        "vištienos fabriką.",
        "„Aardman“ humoras ir šnipų filmo nuotaika – juokinga visiems.",
        "Kelios įtemptos pabėgimo scenos fabrike, bet viskas baigiasi gerai.",
    ),
    (
        "The Mitchells vs. the Machines", 2021, "🤖",
        "Šeimos kelionė nuvežti dukrą į koledžą netikėtai virsta kova su pasauliniu "
        "robotų sukilimu.",
        "Tiesiog apie šeimą su paaugliu – juoksis visi, o paaugliai atpažins save.",
        "Robotai triukšmingi, bet komiški; „Furby“ scena gali būti truputį baugi.",
    ),
    (
        "Puss in Boots: The Last Wish", 2022, "🐈",
        "Batuotasis katinas išeikvojo aštuonis iš devynių gyvenimų ir leidžiasi ieškoti "
        "Norų žvaigždės.",
        "Stilingas, greitas ir labai juokingas nuotykis – vienas geriausių „DreamWorks“.",
        "Vilkas (Mirtis) tikrai gali išgąsdinti 6-metį – pirma pažiūrėkit anonsą kartu.",
    ),
    (
        "Leo", 2023, "🦎",
        "74 metų driežas iš mokyklos klasės terariumo nusprendžia pabėgti, bet pirma "
        "ima padėti vaikams su jų bėdomis.",
        "Muzikinė komedija apie mokyklą, kurią supras ir paaugliai, ir pirmokas.",
        "Linksmas mokyklinis humoras; nieko baisaus.",
    ),
    (
        "The Bad Guys", 2022, "🐺",
        "Gyvūnų nusikaltėlių gauja apsimeta, kad pasitaiso, bet planas pradeda "
        "keistis.",
        "Kaip šeimai pritaikytas „Vandenyno vienuolikos“ filmas – stilingas ir smagus.",
        "Daug veiksmo ir gaudynių, bet viskas komiška.",
    ),
    (
        "Migration", 2023, "🦆",
        "Atsargus tėtis antinas pagaliau leidžiasi su šeima į kelionę į Jamaiką.",
        "Lengvas, juokingas kelionių filmas apie šeimos nuotykius.",
        "Scena su virėju gali būti truputį įtempta, bet trumpa.",
    ),
    (
        "The Wild Robot", 2024, "🤖",
        "Robotė Roz atsiduria laukinėje saloje ir netikėtai užaugina našlaitį žąsiuką "
        "Brightbillą.",
        "Jaudinanti ir graži istorija apie tai, ką reiškia būti šeima.",
        "Yra liūdnų ir įtemptų momentų (audra, gaisras), bet labai šilta.",
    ),
    (
        "Wonka", 2023, "🍫",
        "Jaunasis Vilis Vonka atvyksta į miestą su svajone atidaryti šokolado "
        "parduotuvę, bet susiduria su šokolado kartelio gudrybėmis.",
        "Vaidybinis miuziklas su humoru ir daug saldumynų – smagu visiems.",
        "Spalvinga ir saugu.",
    ),
    (
        "Paddington in Peru", 2024, "🐻",
        "Padingtonas su Braunų šeima keliauja į Peru ieškoti dingusios tetos Liusės.",
        "Nuoširdus britiškas humoras, kuris tinka visiems amžiams.",
        "Saugus nuotykis džiunglėse.",
    ),
    (
        "Sonic the Hedgehog", 2020, "🦔",
        "Žaibiškas mėlynasis ežys slapstosi Žemėje, kol jį ima medžioti daktaras "
        "Robotnikas (Jim Carrey).",
        "Paaugliams – žaidimų nostalgija, tėvams – Jim Carrey, mažiesiems – Sonikas.",
        "Daug veiksmo, bet vyrauja humoras.",
    ),
    (
        "Detective Pikachu", 2019, "⚡",
        "Paauglys Timas ir kalbantis Pikachu ieško dingusio tėčio mieste, kuriame "
        "žmonės gyvena kartu su pokemonais.",
        "Detektyvas su pokemonais – smagu ir žaidėjams, ir nežinantiems.",
        "Kelios tamsesnės scenos ir sprogimai – vidutiniškai įtempta.",
    ),
    (
        "Next Gen", 2018, "🤖",
        "Vieniša mergaitė Mai susidraugauja su itin galingu slaptu robotu 7723.",
        "Spalvingas veiksmo filmas apie draugystę ir pyktį – mažiau žinomas „Netflix“ filmas.",
        "Daug robotų kovų; keli intensyvūs momentai.",
    ),
    (
        "Ron's Gone Wrong", 2021, "🤖",
        "Vienišas Barnis gauna sugedusį robotą-draugą Roną, kuris nemoka būti "
        "„normaliu“ draugu.",
        "Juokinga ir protinga istorija apie draugystę ir socialinius tinklus.",
        "Saugus, juokingas.",
    ),
    (
        "Luca", 2021, "🐠",
        "Jūrų pabaisiukas Luka su draugu Alberto praleidžia vasarą Italijos pajūrio "
        "miestelyje, apsimesdami žmonėmis.",
        "Vasariškas, šviesus „Pixar“ filmas apie draugystę.",
        "Švelnus; žvejo personažas truputį grėsmingas.",
    ),
    (
        "Nimona", 2023, "🦄",
        "Futuristiniame viduramžių pasaulyje neteisingai apkaltintas riteris "
        "susidraugauja su formą keičiančia paaugle Nimona.",
        "Paaugliams labai patiks humoras ir stilius; istorija apie priėmimą.",
        "Yra kovų ir tamsesnių temų – labiau paaugliams, mažajam tik su tėvais.",
    ),
    (
        "Dog Man", 2025, "🐶",
        "Pagal Dav Pilkey komiksus: pusiau šuo, pusiau policininkas kovoja su katinu "
        "piktadariu Petiu.",
        "Kvailai linksmas filmas – idealus, kai pagrindinis žiūrovas yra pirmokas.",
        "Nieko baisaus; daug kvailo humoro.",
    ),
    (
        "Elemental", 2023, "🔥",
        "Elementų mieste ugninga Ember susipažįsta su jautriu vandens vaikinu Veidu.",
        "Graži istorija apie šeimą ir imigrantų tėvus – su daug spalvų.",
        "Saugus; yra romantinė linija ir trumpa potvynio scena.",
    ),
]


def seed_movies() -> list[Movie]:
    return [
        Movie(title=t, year=y, emoji=e, desc_lt=d, why_lt=w, kid_note_lt=k, source="seed")
        for t, y, e, d, w, k in _SEED
    ]
