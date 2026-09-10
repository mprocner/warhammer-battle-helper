// .files-tab__empty jest ZAGNIEŻDŻONY w .files-tab__list (FilesTab.jsx).
const files = {
  id: 'files',
  steps: [
    { id: 'list', target: ['.files-tab__empty', '.files-tab__list'], placement: 'left', variants: ['byTarget'] },
    { id: 'createFolder', target: '.files-tab__actions', placement: 'left' },
    { id: 'breadcrumb', target: '.files-tab__breadcrumb', placement: 'left' },
  ],
};

export default files;
