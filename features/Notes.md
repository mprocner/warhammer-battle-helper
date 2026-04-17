### Notatki
Nowa funkcjonalność, która pozwala dodawać notatki do gier.

- Notatki to nowa zakładka w prawym panelu.
- Każda notatka składa się z tytułu i treści. Twórca może ustawiać czy jest prywatna czy publiczna. Prywatne notatki są widoczne tylko dla twórcy, natomiast publiczne mogą być widoczne dla wszystkich graczy w grze.
- Kazdy kto ma dostęp do gry może może dodawać notatki. 
- Każdy kto ma dostęp do notatki może ją edytować i usuwać.
- tytuł notatki to zwykły input, który pozwala na wpisanie tytułu notatki. Tytuł notatki jest wymagany i nie może być pusty.
- Prywatność notatki ustawiamy przez zaznaczenie radio buttona prywatna/publiczna. Domyślnie notatka jest prywatna.
- Treść notatki to wysiwyg, który pozwala na formatowanie tekstu, dodawanie obrazków i linków. Sprawdź darmowe rozwiazania wysiwyg, które można zintegrować z naszym systemem.
- Notatki są przechowywane w bazie danych. Zróbmy nową kolekcję notes, która będzie przechowywać notatki. Każda notatka powinna mieć pole gameId, które będzie wskazywać na grę, do której należy notatka. Oprócz tego notatka powinna mieć pole title, content, isPrivate, createdAt i updatedAt.
- Na liście notatek powinna być możliwość filtrowania notatek po tytule.
- Notatki będą wyświetlane w popupie. Popup powinien być responsywny i dobrze wyglądać zarówno na desktopie jak i na urządzeniach mobilnych. Na desktopie popup powinien być wyświetlany obok panelu z informacjami o grze, natomiast na urządzeniach mobilnych popup powinien zajmować cały ekran. Popup powinien mieć przycisk zamykania, który pozwala użytkownikowi zamknąć popup
- Na liście notatek przy każdej notatce powinien być przycisk usuwania. 
- Notatki wyświetlane są w kolejności od najnowszej do najstarszej.
- Notatki powinny być aktualizowane w czasie rzeczywistym. Jeśli użytkownik doda, edytuje lub usunie notatkę, zmiany powinny być natychmiast widoczne dla wszystkich użytkowników, którzy mają dostęp do tej notatki. Można to osiągnąć za pomocą WebSocketów. 
- Zakładka z notatkami powinna być podobna do zakładki handouty, Na górze nagłówek i przycisk dodaj notatkę, a poniżej lista notatek.
