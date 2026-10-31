// Icon artwork comes from lucide-react (actively maintained upstream); only the
// word list below is ours. This module is loaded with dynamic import() from
// AssetTypeIcon.jsx, so none of it sits in the main bundle or blocks first paint.
import {
  AirVent, Archive, Armchair, AudioLines, Backpack, Badge, Bandage, Battery, BatteryCharging, BedDouble, Bell,
  Bike, Boxes, Bus, Cable, Calculator, Calendar, Camera, Car, ClipboardList, Clock, Coffee, Copy, Cpu, CupSoda,
  Database, Drill, Droplets, Fan, FileText, FlaskConical, Folder, Fuel, Gift, Globe, Hammer, HardDrive, Headphones,
  HeartPulse, Highlighter, Key, Keyboard, Lamp, Laptop, Leaf, Lightbulb, Lock, Luggage, MapPin, MemoryStick, Mic,
  Microscope, Microwave, Monitor, Mouse, MousePointerClick, Notebook, Package, PaintRoller, Paperclip, Pencil,
  Phone, Pill, Plug, Presentation, Printer, Projector, Refrigerator, Router, Ruler, Sailboat, Scan, Scissors,
  Server, Shield, ShoppingCart, Signpost, Smartphone, Sofa, Sparkles, Speaker, SprayCan, Stamp, Stethoscope, Store,
  Syringe, Table, Tablet, Tag, Thermometer, ToolCase, Trash, Trophy, Truck, Tv, Usb, Utensils, Warehouse, Sun,
  WashingMachine, Watch, Wrench, Zap,
} from 'lucide-react';

// Each line is one icon and the lower-case words that should point at it.
const ENTRIES = [
  [Headphones, 'headphone headphones earphone earphones earbud earbuds neckband headset tws handsfree hand-free'],
  [Speaker, 'speaker speakers woofer horn soundbox'],
  [Mic, 'mic mike microphone'],
  [AudioLines, 'audio music sound amplifier'],
  [Tv, 'tv television'],
  [Projector, 'projector projection'],
  [Presentation, 'presentation whiteboard noticeboard'],
  [Camera, 'camera dslr photo'],
  [Camera, 'cctv'],
  [Monitor, 'monitor monitors screen display'],
  [Laptop, 'laptop laptops macbook'],
  [Smartphone, 'mobile smartphone android iphone'],
  [Tablet, 'tablet tablets ipad'],
  [Keyboard, 'keyboard keypad'],
  [Mouse, 'mouse mice'],
  [MousePointerClick, 'pointer cursor'],
  [Cpu, 'cpu processor chip motherboard'],
  [HardDrive, 'harddisk hard-drive hdd ssd drive disk'],
  [MemoryStick, 'pen-drive pendrive sdcard sim ram memory flash'],
  [Database, 'database db'],
  [Server, 'server nas'],
  [Router, 'router modem wifi accesspoint networking'],
  [Usb, 'usb hub dongle adapter'],
  [Cable, 'cable cables wire wires cord connector hdmi vga'],
  [Plug, 'plug plugs socket sockets extension extention powerboard extensionboard extentionboard powerstrip strip switch switches spike multi'],
  [Battery, 'battery batteries cell'],
  [BatteryCharging, 'charger chargers charging powerbank'],
  [Zap, 'generator inverter ups stabilizer electricity'],
  [Lightbulb, 'bulb bulbs light lights tube led'],
  [Lamp, 'lamp torch flashlight lantern'],
  [Fan, 'fan fans'],
  [AirVent, 'ac air-conditioner airconditioner ventilation vent heater'],
  [Refrigerator, 'fridge refrigerator deep-freezer'],
  [Microwave, 'microwave oven'],
  [WashingMachine, 'washing washer dishwasher'],
  [Coffee, 'kettle coffee tea'],
  [CupSoda, 'glass glasses cup mug tumbler'],
  [Utensils, 'utensil utensils plate plates crockery spoon'],
  [Droplets, 'water purifier dispenser filter ro jar geyser'],
  [Sun, 'solar sun panel'],
  [Sparkles, 'cleaning broom mop duster'],
  [SprayCan, 'spray sanitizer disinfectant'],
  [Stethoscope, 'stethoscope'],
  [Syringe, 'injection syringe needle'],
  [Pill, 'medicine pills capsule'],
  [Bandage, 'bandage first-aid drape'],
  [HeartPulse, 'bp pulse oximeter'],
  [Thermometer, 'thermometer'],
  [Printer, 'printer printers toner drum cartridge ink ribbon brother canon epson hp kyocera'],
  [Scan, 'scanner scan'],
  [Copy, 'copy photocopy xerox'],
  [Phone, 'telephone landline fax'],
  [Calculator, 'calculator'],
  [Pencil, 'pencil pencils pen pens marker sketch'],
  [Highlighter, 'highlighter'],
  [Notebook, 'notebook notebooks diary journal book books library'],
  [FileText, 'file files document documents papers form'],
  [Folder, 'folder folders'],
  [ClipboardList, 'clipboard checklist'],
  [Ruler, 'ruler scale measuring'],
  [Scissors, 'scissors cutter'],
  [Paperclip, 'clip clips paperclip pin'],
  [Stamp, 'stamp seal'],
  [PaintRoller, 'paint roller brush painting'],
  [Wrench, 'tool tools wrench spanner screwdriver pliers'],
  [Hammer, 'hammer mallet'],
  [Drill, 'drill'],
  [ToolCase, 'toolbox toolkit'],
  [Armchair, 'chair chairs seat stool'],
  [Sofa, 'sofa couch seating'],
  [Table, 'table tables desk desks'],
  [BedDouble, 'bed beds cot'],
  [Clock, 'clock clocks'],
  [Watch, 'watch watches'],
  [Calendar, 'calendar'],
  [Bell, 'bell alarm'],
  [Key, 'key keys'],
  [Lock, 'lock locks padlock'],
  [Shield, 'shield guard security'],
  [Globe, 'globe map atlas'],
  [MapPin, 'gps tracker location'],
  [Tag, 'tag tags label labels sticker'],
  [Badge, 'badge id-card identity'],
  [Trophy, 'award trophy medal'],
  [Gift, 'gift'],
  [ShoppingCart, 'trolley trolly troly cart'],
  [Warehouse, 'warehouse godown'],
  [Store, 'shop store'],
  [Car, 'car cars vehicle bolero innova sedan'],
  [Bus, 'bus van tempo'],
  [Truck, 'truck lorry pickup'],
  [Bike, 'bike bicycle scooter motorcycle cycle'],
  [Fuel, 'fuel petrol diesel'],
  [Sailboat, 'boat ship'],
  [Microscope, 'microscope lab'],
  [FlaskConical, 'flask chemical reagent'],
  [Leaf, 'plant plants garden nursery'],
  [Signpost, 'sign signboard'],
  [Boxes, 'box boxes carton cartons crate container'],
  [Luggage, 'luggage suitcase'],
  [Backpack, 'bag bags backpack backpak rucksack knapsack'],
  [Package, 'package parcel'],
  [Archive, 'archive almirah cupboard rack'],
  [Trash, 'dustbin bin dustbin'],
];

export const FALLBACK_ICON = Package;

const WORDS = new Map();
for (const [icon, words] of ENTRIES) {
  for (const word of words.split(' ')) {
    const key = word.replace(/[^a-z0-9]/g, '');
    if (key && !WORDS.has(key)) WORDS.set(key, icon);
  }
}

const tokenize = (name) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/**
 * Best-effort icon for a free-text asset type name. English compound nouns put the
 * thing being described last ("laptop battery", "bluetooth mouse"), so tokens are
 * tried right to left and the first known word wins.
 */
export function resolveIcon(name) {
  const tokens = tokenize(name);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    const direct = WORDS.get(token)
      || (token.length > 3 ? WORDS.get(token.replace(/s$/, '')) : null)
      || (token.length > 4 ? WORDS.get(token.replace(/(ies|es|s)$/, '')) : null);
    if (direct) return direct;
  }
  const joined = tokens.join('');
  let best = null;
  for (const [word, icon] of WORDS) {
    if (word.length > 2 && joined.includes(word) && (!best || word.length > best[0].length)) best = [word, icon];
  }
  return best ? best[1] : FALLBACK_ICON;
}
