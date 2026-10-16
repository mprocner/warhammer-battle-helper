import { visibleRect } from './spotlightClip';

const rect = (top, left, bottom, right) => ({ top, left, bottom, right, width: right - left, height: bottom - top });

describe('visibleRect', () => {
  let scroller;
  let anchor;

  beforeEach(() => {
    scroller = document.createElement('div');
    anchor = document.createElement('div');
    scroller.appendChild(anchor);
    document.body.appendChild(scroller);
    scroller.getBoundingClientRect = () => rect(100, 50, 400, 450);
  });

  afterEach(() => scroller.remove());

  it('cuts an anchor taller than its scrolling container down to the container', () => {
    scroller.style.overflowY = 'auto';
    anchor.getBoundingClientRect = () => rect(-200, 60, 900, 440);
    expect(visibleRect(anchor)).toEqual({ top: 100, left: 60, width: 380, height: 300 });
  });

  it('keeps the padded cut-out inside the container when given the padding as inset', () => {
    scroller.style.overflowY = 'auto';
    anchor.getBoundingClientRect = () => rect(-200, 60, 900, 440);
    expect(visibleRect(anchor, 6)).toEqual({ top: 106, left: 60, width: 380, height: 288 });
  });

  it('leaves the anchor whole when no ancestor clips it', () => {
    anchor.getBoundingClientRect = () => rect(-200, 60, 500, 440);
    expect(visibleRect(anchor)).toEqual({ top: 0, left: 60, width: 380, height: 500 });
  });

  it('clips only the axis whose overflow is not visible', () => {
    scroller.style.overflowX = 'hidden';
    anchor.getBoundingClientRect = () => rect(20, 0, 500, 600);
    expect(visibleRect(anchor)).toEqual({ top: 20, left: 50, width: 400, height: 480 });
  });
});
