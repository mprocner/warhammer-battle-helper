package service

import "testing"

// Inputs in the "kept" cases mirror Tiptap 3.22.3 getHTML() output for the note editor
// extensions (noteExtensions.js). If a Tiptap upgrade changes that markup, refresh these
// strings from a real browser session, not from memory.
func TestNoteHTMLPolicy(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		// kept unchanged
		{"text colour and size on one span",
			`<p><span style="color: #a8322d; font-size: 18px">x</span></p>`,
			`<p><span style="color: #a8322d; font-size: 18px">x</span></p>`},
		{"font size range edges",
			`<p><span style="font-size: 8px">x</span><span style="font-size: 72px">y</span></p>`,
			`<p><span style="font-size: 8px">x</span><span style="font-size: 72px">y</span></p>`},
		{"multicolor highlight",
			`<p><mark data-color="#fff3a3" style="background-color: #fff3a3; color: inherit">x</mark></p>`,
			`<p><mark data-color="#fff3a3" style="background-color: #fff3a3; color: inherit">x</mark></p>`},
		{"alignment on paragraph and heading",
			`<p style="text-align: center">x</p><h1 style="text-align: right">t</h1>`,
			`<p style="text-align: center">x</p><h1 style="text-align: right">t</h1>`},
		{"tiptap https link",
			`<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">l</a></p>`,
			`<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">l</a></p>`},
		{"underline and h3 still allowed",
			`<h3><u>t</u></h3>`,
			`<h3><u>t</u></h3>`},

		// rewritten by policy
		{"mailto link gets noreferrer",
			`<p><a href="mailto:gm@example.com">m</a></p>`,
			`<p><a href="mailto:gm@example.com" rel="noreferrer">m</a></p>`},

		// stripped
		{"font size below and above range",
			`<p><span style="font-size: 7px">x</span><span style="font-size: 73px">y</span></p>`,
			`<p><span>x</span><span>y</span></p>`},
		{"named and rgb colours",
			`<p><span style="color: red">x</span><span style="color: rgb(1, 2, 3)">y</span></p>`,
			`<p><span>x</span><span>y</span></p>`},
		{"unlisted property dropped, listed one kept",
			`<p><span style="color: #ff0000; background-image: url(//evil.com/x.png)">x</span></p>`,
			`<p><span style="color: #ff0000">x</span></p>`},
		{"justify is not an allowed alignment",
			`<p style="text-align: justify">j</p>`,
			`<p>j</p>`},
		{"javascript href removes the link",
			`<p><a href="javascript:alert(1)">bad</a></p>`,
			`<p>bad</p>`},
		{"position fixed stripped everywhere",
			`<p style="position: fixed"><span style="position: fixed">x</span></p>`,
			`<p><span>x</span></p>`},
		{"style on element without style allowance",
			`<blockquote style="color: #a8322d">q</blockquote>`,
			`<blockquote>q</blockquote>`},
		{"event handler element removed",
			`<p><img src=x onerror="alert(1)">t</p>`,
			`<p>t</p>`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := noteHTMLPolicy.Sanitize(tt.in); got != tt.want {
				t.Errorf("Sanitize(%q)\n got %q\nwant %q", tt.in, got, tt.want)
			}
		})
	}
}
