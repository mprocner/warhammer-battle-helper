import React from 'react';
import { usePortalTooltip } from '../common/PortalTooltip';

// Etykieta wpisu w logu: obcinana z ellipsis (klasa .log-list-item__character-name w
// LogWindow.css), z pełną treścią w tooltipie na hover.
//
// Tooltip odpala się TYLKO gdy tekst faktycznie został ucięty. Ellipsis jest sygnałem
// "jest więcej do przeczytania", więc etykieta, która się mieści, nie potrzebuje hinta.
// scrollWidth to szerokość nieobciętej treści, clientWidth widocznego boksa — różnią się
// dokładnie wtedy, gdy overflow:hidden coś uciął.
//
// Komponent trzyma własny usePortalTooltip zamiast brać handlery z propsów: z 23 miejsc
// użycia tylko CustomRoll ma dziś ten hook, więc plumbing propsów przez pozostałe 22
// pliki byłby czystym kosztem.
//
// children służy nagłówkom coc7e/dnd5e, które dopisują "(username)" obok nazwy postaci:
// renderujemy wtedy gotowy JSX, ale tooltip pokazuje samo `text`.
function TruncatedLabel({ text, children, as = 'span' }) {
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  const Tag = as;

  return (
    <>
      <Tag
        className="log-list-item__character-name"
        onMouseEnter={e => {
          const el = e.currentTarget;
          if (el.scrollWidth > el.clientWidth) showTooltip(text, el);
        }}
        onMouseLeave={hideTooltip}
      >
        {children ?? text}
      </Tag>
      {tooltipNode}
    </>
  );
}

export default TruncatedLabel;
