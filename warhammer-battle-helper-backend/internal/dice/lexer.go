package dice

import "unicode"

type tokenKind int

const (
	tokEOF tokenKind = iota
	tokNumber
	tokD
	tokPlus
	tokMinus
	tokKeepHigh
	tokKeepLow
	tokAtLeast
	tokVs
)

type token struct {
	kind  tokenKind
	value int // tokNumber only
	pos   int // rune offset into the input
}

// numberCap saturates absurdly long digit runs so they cannot overflow int.
// Anything this large fails a range check in validate anyway.
const numberCap = 1_000_000_000

// lex splits the input into tokens. Whitespace is insignificant everywhere,
// so "d100 -1" and "d100-1" produce the same tokens.
func lex(input string) ([]token, error) {
	runes := []rune(input)
	var toks []token
	for i := 0; i < len(runes); {
		r := unicode.ToLower(runes[i])
		switch {
		case unicode.IsSpace(r):
			i++
		case r >= '0' && r <= '9':
			start, n := i, 0
			for i < len(runes) && runes[i] >= '0' && runes[i] <= '9' {
				if n < numberCap {
					n = n*10 + int(runes[i]-'0')
				}
				i++
			}
			if n > numberCap {
				n = numberCap
			}
			toks = append(toks, token{kind: tokNumber, value: n, pos: start})
		case r == 'd':
			toks = append(toks, token{kind: tokD, pos: i})
			i++
		case r == '+':
			toks = append(toks, token{kind: tokPlus, pos: i})
			i++
		case r == '-':
			toks = append(toks, token{kind: tokMinus, pos: i})
			i++
		case r == 'k':
			switch lowerAt(runes, i+1) {
			case 'h':
				toks = append(toks, token{kind: tokKeepHigh, pos: i})
			case 'l':
				toks = append(toks, token{kind: tokKeepLow, pos: i})
			default:
				return nil, newError(CodeUnexpectedToken, i, nil)
			}
			i += 2
		case r == '>':
			if lowerAt(runes, i+1) != '=' {
				return nil, newError(CodeUnexpectedToken, i, nil)
			}
			toks = append(toks, token{kind: tokAtLeast, pos: i})
			i += 2
		case r == 'v':
			if lowerAt(runes, i+1) != 's' {
				return nil, newError(CodeUnexpectedToken, i, nil)
			}
			toks = append(toks, token{kind: tokVs, pos: i})
			i += 2
		default:
			return nil, newError(CodeUnexpectedToken, i, nil)
		}
	}
	return append(toks, token{kind: tokEOF, pos: len(runes)}), nil
}

func lowerAt(runes []rune, i int) rune {
	if i >= len(runes) {
		return 0
	}
	return unicode.ToLower(runes[i])
}
