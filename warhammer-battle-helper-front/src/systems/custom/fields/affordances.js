// One size for every affordance icon on the custom sheet: the favourites star, the die, and a
// row's own save/edit/delete buttons.
//
// They are rendered from three different files, which is how they drifted to 11, 12, 13 and 14px
// without anyone deciding to — each was chosen next to its own neighbours and never next to the
// others. A single constant is what stops that happening again: change this number and every
// affordance moves together.
export const AFFORDANCE_ICON_SIZE = 16;
