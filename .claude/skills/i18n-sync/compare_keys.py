#!/usr/bin/env python3
"""Deterministyczny diff kluczy i18n między en/ i pl/ dla wszystkich namespace'ów.

Wypisuje klucze obecne w jednym języku a brakujące w drugim, per namespace.
Część MECHANICZNA skilla i18n-sync — model nie zgaduje, skrypt liczy.

Użycie:
    python3 compare_keys.py [ścieżka_do_locales]
Domyślnie: warhammer-battle-helper-front/src/locales (wyszukiwane w górę od cwd).
"""
import json
import sys
from pathlib import Path


def flatten(obj, prefix=""):
    """Zamienia zagnieżdżony JSON na płaski zbiór kluczy 'a.b.c'."""
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            full = f"{prefix}.{k}" if prefix else k
            if isinstance(v, dict):
                keys |= flatten(v, full)
            else:
                keys.add(full)
    return keys


def find_locales(arg):
    if arg:
        return Path(arg)
    here = Path.cwd()
    for base in [here, *here.parents]:
        cand = base / "warhammer-battle-helper-front" / "src" / "locales"
        if cand.is_dir():
            return cand
    sys.exit("Nie znaleziono katalogu locales/. Podaj ścieżkę jako argument.")


def load(path):
    return flatten(json.loads(path.read_text(encoding="utf-8")))


def main():
    locales = find_locales(sys.argv[1] if len(sys.argv) > 1 else None)
    en_dir, pl_dir = locales / "en", locales / "pl"
    namespaces = sorted(p.stem for p in en_dir.glob("*.json"))

    total_missing = 0
    for ns in namespaces:
        en_file, pl_file = en_dir / f"{ns}.json", pl_dir / f"{ns}.json"
        if not pl_file.exists():
            print(f"[{ns}] BRAK CAŁEGO PLIKU pl/{ns}.json")
            total_missing += 1
            continue
        en_keys, pl_keys = load(en_file), load(pl_file)
        missing_in_pl = sorted(en_keys - pl_keys)
        missing_in_en = sorted(pl_keys - en_keys)
        if not missing_in_pl and not missing_in_en:
            print(f"[{ns}] OK ({len(en_keys)} kluczy, zsynchronizowane)")
            continue
        print(f"[{ns}] ROZJAZD:")
        for k in missing_in_pl:
            print(f"  - brak w pl: {k}   (en: {ns}.json)")
        for k in missing_in_en:
            print(f"  - brak w en: {k}   (pl: {ns}.json)")
        total_missing += len(missing_in_pl) + len(missing_in_en)

    print(f"\nRAZEM rozjechanych kluczy: {total_missing}")
    sys.exit(1 if total_missing else 0)


if __name__ == "__main__":
    main()