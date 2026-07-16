# components/icons

Własne ikony SVG — **tylko** dla glifów, których nie ma w `@mui/icons-material`.

Domyślna konwencja projektu (patrz `CLAUDE.md`) to ikony z MUI wszędzie. Dodawaj
komponent tutaj wyłącznie, gdy dana ikona nie ma odpowiednika w MUI (np. `SkullIcon` —
Material Icons nie zawiera czaszki).

## Konwencja komponentu

- `export default` z pliku `NazwaIcon.jsx` + reeksport w `index.js`.
- Props: `size` (px, domyślnie 16) oraz `...rest` rozłożone na `<svg>`.
- `fill="currentColor"` — kolor sterowany przez CSS `color` u wołającego.
- `aria-hidden="true"` (ikony dekoracyjne).

```jsx
import { SkullIcon } from '../icons';
<SkullIcon size={16} />
```
