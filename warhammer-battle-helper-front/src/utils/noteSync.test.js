import { shouldApplyRemoteNote } from './noteSync';

const STAMP_MINE = '2026-08-24T10:00:02.000000002Z';
const STAMP_THEIRS = '2026-08-24T10:00:09.000000009Z';

describe('shouldApplyRemoteNote', () => {
  it('rejects the echo of our own save', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_MINE,
      ownSaveStamp: STAMP_MINE,
      isDirty: false,
    })).toBe(false);
  });

  it('rejects a remote revision while the user is still typing', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_THEIRS,
      ownSaveStamp: STAMP_MINE,
      isDirty: true,
    })).toBe(false);
  });

  it('accepts a remote revision when the editor is idle', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_THEIRS,
      ownSaveStamp: STAMP_MINE,
      isDirty: false,
    })).toBe(true);
  });

  it('accepts the first revision when nothing has been saved from this editor yet', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: STAMP_THEIRS,
      ownSaveStamp: null,
      isDirty: false,
    })).toBe(true);
  });

  it('accepts a remote revision that happens to carry no stamp', () => {
    expect(shouldApplyRemoteNote({
      incomingUpdatedAt: undefined,
      ownSaveStamp: null,
      isDirty: false,
    })).toBe(true);
  });
});
