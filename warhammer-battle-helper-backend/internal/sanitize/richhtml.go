// Package sanitize holds the HTML policy for user-authored rich text.
package sanitize

import (
	"regexp"

	"github.com/microcosm-cc/bluemonday"
)

// Rich text (notes, styled sheet fields) is stored as HTML and rendered by every participant's
// editor, so this policy is the only XSS boundary. Each regex is anchored: an unanchored one
// would accept any value that merely contains a valid fragment.
//
// Every mark and attribute the editor emits (RICH_TEXT_EXTENSIONS in
// warhammer-battle-helper-front/src/components/common/richText/richTextExtensions.js) must be
// allowed here, or the server strips it on save and the WS echo wipes the formatting.
//
// Keep fontSizeRe in sync with FONT_SIZE_MIN / FONT_SIZE_MAX in
// warhammer-battle-helper-front/src/components/common/richText/richTextFormatting.js.
var (
	colorRe     = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	fontSizeRe  = regexp.MustCompile(`^([89]|[1-6][0-9]|7[0-2])px$`)
	alignRe     = regexp.MustCompile(`^(left|center|right)$`)
	markColorRe = regexp.MustCompile(`^inherit$`) // Tiptap Highlight emits "color: inherit"
)

var richHTMLPolicy = newRichHTMLPolicy()

func newRichHTMLPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy()
	p.AllowStandardAttributes()
	p.AllowElements(
		"b", "i", "u", "strong", "em", "s",
		"p", "br", "hr",
		"ul", "ol", "li",
		"h1", "h2", "h3",
		"blockquote", "pre", "code",
		"span", "mark", "a",
	)

	p.AllowStyles("color").Matching(colorRe).OnElements("span")
	p.AllowStyles("font-size").Matching(fontSizeRe).OnElements("span")
	p.AllowStyles("background-color").Matching(colorRe).OnElements("mark")
	p.AllowStyles("color").Matching(markColorRe).OnElements("mark")
	p.AllowAttrs("data-color").Matching(colorRe).OnElements("mark")
	p.AllowStyles("text-align").Matching(alignRe).OnElements("p", "h1", "h2", "h3")

	p.AllowAttrs("href", "target", "rel").OnElements("a")
	p.RequireParseableURLs(true)
	p.AllowURLSchemes("http", "https", "mailto")
	p.AddTargetBlankToFullyQualifiedLinks(true)
	p.RequireNoReferrerOnLinks(true)
	return p
}

// RichHTML returns s with everything the rich-text policy does not allow removed.
func RichHTML(s string) string {
	return richHTMLPolicy.Sanitize(s)
}
