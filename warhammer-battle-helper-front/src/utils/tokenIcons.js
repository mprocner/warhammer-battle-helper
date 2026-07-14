// Shared, curated MUI icon catalog for token-display icon slots (FEATURE-102).
// The token-display config stores an icon by its stable component-name string
// (e.g. "LocalFireDepartment"); resolveIcon() turns that back into a component for
// rendering. A curated allowlist is used deliberately — the full @mui/icons-material
// set (~2100 icons) cannot be dynamically imported (bundlers need static imports)
// and would be unusable as a picker.

import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import HeartBrokenIcon from '@mui/icons-material/HeartBroken';
import HearingDisabledIcon from '@mui/icons-material/HearingDisabled';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import BatteryAlertIcon from '@mui/icons-material/BatteryAlert';
import SickIcon from '@mui/icons-material/Sick';
import HotelIcon from '@mui/icons-material/Hotel';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import CrisisAlertIcon from '@mui/icons-material/CrisisAlert';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import ShieldIcon from '@mui/icons-material/Shield';
import GppBadIcon from '@mui/icons-material/GppBad';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BoltIcon from '@mui/icons-material/Bolt';
import FavoriteIcon from '@mui/icons-material/Favorite';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import DangerousIcon from '@mui/icons-material/Dangerous';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import RemoveRedEyeIcon from '@mui/icons-material/RemoveRedEye';
import StarIcon from '@mui/icons-material/Star';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import HealingIcon from '@mui/icons-material/Healing';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import LockIcon from '@mui/icons-material/Lock';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import PanToolIcon from '@mui/icons-material/PanTool';
import BlockIcon from '@mui/icons-material/Block';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import DiamondIcon from '@mui/icons-material/Diamond';

// TOKEN_ICONS maps a stable icon name → MUI component. Keys are used verbatim in the
// stored config (TokenSlot.icon).
export const TOKEN_ICONS = {
  LocalFireDepartment: LocalFireDepartmentIcon,
  Bloodtype: BloodtypeIcon,
  VisibilityOff: VisibilityOffIcon,
  HeartBroken: HeartBrokenIcon,
  HearingDisabled: HearingDisabledIcon,
  LinkOff: LinkOffIcon,
  BatteryAlert: BatteryAlertIcon,
  Sick: SickIcon,
  Hotel: HotelIcon,
  ElectricBolt: ElectricBoltIcon,
  CrisisAlert: CrisisAlertIcon,
  Bedtime: BedtimeIcon,
  Shield: ShieldIcon,
  GppBad: GppBadIcon,
  AutoAwesome: AutoAwesomeIcon,
  Bolt: BoltIcon,
  Favorite: FavoriteIcon,
  Psychology: PsychologyIcon,
  AcUnit: AcUnitIcon,
  Whatshot: WhatshotIcon,
  Dangerous: DangerousIcon,
  DirectionsRun: DirectionsRunIcon,
  RemoveRedEye: RemoveRedEyeIcon,
  Star: StarIcon,
  WaterDrop: WaterDropIcon,
  ReportProblem: ReportProblemIcon,
  Healing: HealingIcon,
  VolumeOff: VolumeOffIcon,
  Lock: LockIcon,
  FlashOn: FlashOnIcon,
  SentimentVeryDissatisfied: SentimentVeryDissatisfiedIcon,
  PanTool: PanToolIcon,
  Block: BlockIcon,
  BlurOn: BlurOnIcon,
  Diamond: DiamondIcon,
};

// resolveIcon returns the MUI component for a stored icon name, or null if unknown
// (e.g. a config authored against a since-removed icon).
export function resolveIcon(name) {
  return TOKEN_ICONS[name] || null;
}
