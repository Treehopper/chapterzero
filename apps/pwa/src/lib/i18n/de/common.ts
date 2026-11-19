/** German texts: see ./index.ts */
export const common: Record<string, string> = {
  // App
  'Something went wrong': 'Etwas ist schiefgelaufen',
  'Reload': 'Neu laden',

  // Boxes
  'Cards per box': 'Karten pro Fach',
  'Box {i}: {n} cards': 'Fach {i}: {n} Karten',
  'new / missed': 'neu / falsch',
  '{n} d': '{n} T.',
  'mastered': 'gemeistert',

  // FrontSwipeConfirm
  'Grade without flipping?': 'Ohne Umdrehen bewerten?',
  "You swiped before turning the card over. Should a swipe on the front count right away (right = knew it, left = didn't know)?":
    'Du hast gewischt, bevor du die Karte umgedreht hast. Soll ein Wischen auf der Vorderseite gleich zählen (rechts = gewusst, links = nicht gewusst)?',
  'You can change this later in Settings › Vocabulary check: flip before answering.':
    'Du kannst das später ändern unter Einstellungen › Wortschatztest: vor dem Antworten umdrehen.',
  'Yes, count it as “{answer}”': 'Ja, als „{answer}“ zählen',
  'knew it': 'gewusst',
  "didn't know": 'nicht gewusst',
  "No, I'll flip first": 'Nein, ich drehe erst um',

  // FrontSwipeKnown
  'Mark as known?': 'Als bekannt markieren?',
  'Mark “{word}” as known?': '„{word}“ als bekannt markieren?',
  "You swiped right without turning the card over. Known words leave your cards for good, so you won't see them again.":
    'Du hast nach rechts gewischt, ohne die Karte umzudrehen. Bekannte Wörter verlassen deine Karten für immer – du siehst sie nicht wieder.',
  'Yes, mark as known': 'Ja, als bekannt markieren',
  'No, count it as “knew it” and keep reviewing it': 'Nein, als „gewusst“ zählen und weiter wiederholen',
  "Cancel, I'll flip first": 'Abbrechen, ich drehe erst um',
  'Your choice is used for later swipes too; change it in Settings › Swipe right before flipping.':
    'Deine Wahl gilt auch für spätere Wischer; ändern kannst du sie unter Einstellungen › Nach rechts wischen vor dem Umdrehen.',

  // GestureHints
  'tap to flip': 'zum Umdrehen tippen',
  'swipe': 'wischen',
  'swipe up': 'nach oben wischen',
  'to edit the card or end the session': 'um die Karte zu bearbeiten oder die Sitzung zu beenden',

  // Info

  // LookupLinks
  'offline — lookup links need a connection': 'offline – zum Nachschlagen brauchst du eine Verbindung',

  // StartStudy
  'Get this chapter ready': 'Dieses Kapitel vorbereiten',
  'Get ready to read': 'Fürs Lesen vorbereiten',
  'Quick start': 'Schnellstart',
  "{n} due reviews, then this chapter's new cards": '{n} fällige Wiederholungen, dann die neuen Karten dieses Kapitels',
  "{n} due reviews, then today's new cards": '{n} fällige Wiederholungen, dann die neuen Karten von heute',
  "Due reviews, then this chapter's new cards": 'Fällige Wiederholungen, dann die neuen Karten dieses Kapitels',
  "Due reviews, then today's new cards": 'Fällige Wiederholungen, dann die neuen Karten von heute',
  'Number of cards': 'Anzahl Karten',
  '{n} cards': '{n} Karten',
  'Time': 'Zeit',
  '{n} min': '{n} Min.',
  'A chosen number or time can go past the daily limit for new cards.':
    'Eine gewählte Anzahl oder Zeit kann über das Tageslimit für neue Karten hinausgehen.',

  // achievements (lib/ui.svelte.ts)
  'Bronze': 'Bronze',
  'Silver': 'Silber',
  'Gold': 'Gold',
  'Ready for {title}': 'Bereit für {title}',
  'Correct answers in a row': 'Richtige Antworten in Folge',
  'Correct answers in total': 'Richtige Antworten insgesamt',
  'Books ready to read': 'Bücher bereit zum Lesen',
  'Cards finally known after 3+ misses in a row': 'Karten, die du nach 3+ Fehlern in Folge endlich wusstest',
  'Every chapter ready to read': 'Jedes Kapitel bereit zum Lesen',

  // core error messages
  'A card needs a translation or a definition': 'Eine Karte braucht eine Übersetzung oder eine Definition',
  'A card needs a translation': 'Eine Karte braucht eine Übersetzung',
  'Add a translation': 'Füge eine Übersetzung hinzu',
  'Book not found': 'Buch nicht gefunden',
  'Card not found': 'Karte nicht gefunden',
  'Chapter not found': 'Kapitel nicht gefunden',
  'Could not reach the word-list server. Check your connection and try again.':
    'Der Wortlisten-Server ist nicht erreichbar. Prüf deine Verbindung und versuch es noch mal.',
  'Flip the card before grading': 'Dreh die Karte um, bevor du bewertest',
  'Import draft not found': 'Import-Entwurf nicht gefunden',
  'Lookup links must be https and contain {word}': 'Nachschlage-Links müssen https verwenden und {word} enthalten',
  'No current card': 'Keine aktuelle Karte',
  'No vocabulary check in progress': 'Kein Wortschatztest im Gange',
  'Not a VocabFirst backup file': 'Keine VocabFirst-Sicherungsdatei',
  'Session not found': 'Sitzung nicht gefunden',
  'This book was imported before the reader existed; import it again to read it here':
    'Dieses Buch wurde importiert, bevor es die Lesefunktion gab; importiere es noch mal, um es hier zu lesen',
  'This EPUB has no package document.': 'Dieses EPUB hat kein Paketdokument.',
  'This file is not a valid EPUB (it could not be unzipped).': 'Diese Datei ist kein gültiges EPUB (sie ließ sich nicht entpacken).',
  'This file is not a valid EPUB (META-INF/container.xml is missing).': 'Diese Datei ist kein gültiges EPUB (META-INF/container.xml fehlt).',
  'Type a word': 'Gib ein Wort ein',
};
