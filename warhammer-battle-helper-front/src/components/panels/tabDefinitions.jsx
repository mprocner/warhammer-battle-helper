import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';

// Kolejność jest kolejnością renderowania w prawym panelu i w legendzie samouczka.
export const TAB_DEFS = [
  { id: 'chat', Icon: ChatBubbleOutlineIcon, gmOnly: false },
  { id: 'scenes', Icon: MapOutlinedIcon, gmOnly: true },
  { id: 'handouts', Icon: ArticleOutlinedIcon, gmOnly: false },
  { id: 'files', Icon: FolderOutlinedIcon, gmOnly: true },
  { id: 'music', Icon: LibraryMusicOutlinedIcon, gmOnly: true },
  { id: 'notes', Icon: StickyNote2OutlinedIcon, gmOnly: false },
  { id: 'players', Icon: PeopleOutlinedIcon, gmOnly: true },
  { id: 'minigames', Icon: CasinoOutlinedIcon, gmOnly: true },
  { id: 'general', Icon: SettingsOutlinedIcon, gmOnly: false },
];

export const tabsForRole = (isGM) => TAB_DEFS.filter(def => isGM || !def.gmOnly);
