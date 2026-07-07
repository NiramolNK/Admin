import { useState, useMemo, useEffect, useRef } from "react";
import CSAnalyticsTab from "./CSAnalyticsTab.jsx";
import { supabase, onStateChange } from "./supabase.js";

// ── Icons ─────────────────────────────────────────────────────────────────────
const Ico = ({size=16,color="currentColor",style={},children}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,...style}}>{children}</svg>
);
const Sliders = (p) => <Ico {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Ico>;
const Search = (p) => <Ico {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></Ico>;
const CalendarIcon = (p) => <Ico {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></Ico>;
const IconGrid = (p) => <Ico {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Ico>;
const IconUsers = (p) => <Ico {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Ico>;
const IconBarChart = (p) => <Ico {...p}><path d="M12 20V10M18 20V4M6 20v-4"/></Ico>;
const IconFileText = (p) => <Ico {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 13h4M10 17h4M8 9h2"/></Ico>;
const NirmLogo = ({size=32,light=false}) => {
  const bg = light ? "#fff" : "#0D9488";
  const fg = light ? "#0D9488" : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" style={{flexShrink:0}}>
      <rect width="36" height="36" rx="10" fill={bg}/>
      <rect x="7" y="20" width="5" height="9" rx="2" fill={fg} opacity="0.45"/>
      <rect x="15.5" y="14" width="5" height="15" rx="2" fill={fg} opacity="0.7"/>
      <rect x="24" y="7" width="5" height="22" rx="2" fill={fg}/>
      <circle cx="27" cy="7" r="2.5" fill={fg}/>
    </svg>
  );
};
const IconX = (p) => <Ico {...p}><path d="M18 6 6 18M6 6l12 12"/></Ico>;
const IconChevL = (p) => <Ico {...p}><path d="m15 18-6-6 6-6"/></Ico>;
const IconChevR = (p) => <Ico {...p}><path d="m9 18 6-6-6-6"/></Ico>;
const IconUpload = (p) => <Ico {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></Ico>;
const IconDownload = (p) => <Ico {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></Ico>;
const IconTrash = (p) => <Ico {...p}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></Ico>;
const IconPlus = (p) => <Ico {...p}><path d="M12 5v14M5 12h14"/></Ico>;
const IconCheck = (p) => <Ico {...p}><path d="M20 6 9 17l-5-5"/></Ico>;
const IconAlert = (p) => <Ico {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></Ico>;
const IconSend = (p) => <Ico {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/></Ico>;
const IconCopy = (p) => <Ico {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Ico>;
const IconLogOut = (p) => <Ico {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></Ico>;
const IconSun = (p) => <Ico {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></Ico>;
const IconMoon = (p) => <Ico {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></Ico>;
const IconSunset = (p) => <Ico {...p}><path d="M12 10V2M4.93 10.93l1.41 1.41M2 18h2M20 18h2M19.07 10.93l-1.41 1.41M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/></Ico>;

// ── Constants ────────────────────────────────────────────────────────────────
const ALLOC_SHIFTS  = [{code:"M",label:"Morning"},{code:"ME",label:"Mid"},{code:"E",label:"Evening"}];
const ALLOC_DAYS    = [{code:"Mon",wd:1},{code:"Tue",wd:2},{code:"Wed",wd:3},{code:"Thu",wd:4},{code:"Fri",wd:5},{code:"Sat",wd:6},{code:"Sun",wd:0}];
const ALLOC_WK      = [1,2,3,4,5];
const ALLOC_ALL     = [1,2,3,4,5,6,0];
const ALLOC_SHIFT_C = {M:{bg:"#DBEAFE",color:"#1D4ED8",label:"M"},ME:{bg:"#F0FDFA",color:"#0F766E",label:"ME"},E:{bg:"#D1FAE5",color:"#065F46",label:"E"},Off:{bg:"#FEE2E2",color:"#B91C1C",label:"Off"},TOIL:{bg:"#FEF3C7",color:"#92400E",label:"TOIL"},OT:{bg:"#FCE7F3",color:"#9D174D",label:"OT"}};
const ALLOC_TEAM_C  = {T2:{color:"#1D4ED8",bg:"#DBEAFE"},T1:{color:"#0F766E",bg:"#F0FDFA"},Return:{color:"#B91C1C",bg:"#FEE2E2"},CC:{color:"#7C3AED",bg:"#F3E8FF"}};
const ALLOC_AGENTS_INIT = [
  {id:"A01",name:"Markhom", team:"T2",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:766, rule:""},
  {id:"A02",name:"Veer",    team:"T2",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:953, rule:""},
  {id:"A03",name:"Aorr",    team:"T2",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:885, rule:""},
  {id:"A04",name:"Mark",    team:"T2",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:440, rule:""},
  {id:"A05",name:"Cream T2",team:"T2",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:846, rule:""},
  {id:"A16",name:"Prim",    team:"T2",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:1269,rule:"Manager"},
  {id:"A06",name:"Ohm",     team:"T1",    active:true,shifts:["M"],        days:[...ALLOC_WK],  costDay:480,rule:"Sat & Sun off"},
  {id:"A08",name:"Joy",     team:"T1",    active:true,shifts:["M","ME","E"],days:[...ALLOC_ALL],costDay:496,rule:""},
  {id:"A09",name:"Boo",     team:"T1",    active:true,shifts:["E"],        days:[...ALLOC_ALL], costDay:456,rule:""},
  {id:"A10",name:"Best",    team:"T1",    active:true,shifts:["M","ME","E"],days:[...ALLOC_ALL],costDay:480,rule:"Min 15 sessions"},
  {id:"A11",name:"KhaoPun", team:"T1",    active:true,shifts:["M","ME","E"],days:[...ALLOC_ALL],costDay:448,rule:""},
  {id:"A12",name:"Cream",   team:"T1",    active:true,shifts:["M","E"],    days:[...ALLOC_ALL], costDay:464,rule:""},
  {id:"A13",name:"Ploy D",  team:"T1",    active:true,shifts:["E"],        days:[...ALLOC_ALL], costDay:416,rule:""},
  {id:"A14",name:"Ploy",    team:"T1",    active:true,shifts:["M"],        days:[...ALLOC_ALL], costDay:400,rule:""},
  {id:"A15",name:"AOF",     team:"Return",active:true,shifts:["M"],        days:[1,2,3,4,5,6],  costDay:464,rule:"Sunday off"},
];
const ALLOC_FLAGS_INIT = {
  "2026-04-06":{type:"holiday",label:"Chakri Day"},
  "2026-04-13":{type:"holiday",label:"Songkran"},
  "2026-04-14":{type:"holiday",label:"Songkran"},
  "2026-04-15":{type:"holiday",label:"Songkran"},
};
const ALLOC_BUDGET = {Alpha:50000,Beta:40000,Gamma:35000};

// Company info that appears on every payroll invoice (CREA Trading)
const COMPANY_INFO = {
  taxId: "0105562106328",
  name: "บริษัท ซีอาร์อีเอ เทรดดิ้ง จำกัด",
  address: "712/1 อาคารทีบีไอ ชั้นที่ 6 ถนนสุขุมวิท 26 และ 28 แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110",
};
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const THAI_MONTH_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const WITHHOLDING_RATE = 0.03;
const ALLOC_BRANDS  = ["Alpha","Beta","Gamma"];

// ── Platforms ────────────────────────────────────────────────────────────────
const PLATFORMS = ["Shopee","Lazada","Tiktok","Line MyShop","Amaze","Brand.com","Call CC"];
const PLATFORM_C = {
  Shopee:       {color:"#EE4D2D", bg:"#FFF7ED", icon:""},
  Lazada:       {color:"#0F5BF1", bg:"#EFF6FF", icon:""},
  Tiktok:       {color:"#000000", bg:"#F1F5F9", icon:""},
  "Line MyShop":{color:"#06C755", bg:"#E8FFF0", icon:""},
  Amaze:        {color:"#1D4ED8", bg:"#DBEAFE", icon:""},
  "Brand.com":  {color:"#B45309", bg:"#FEF3C7", icon:""},
  "Call CC":    {color:"#7C3AED", bg:"#F3E8FF", icon:""},
};

// ── Store Performance Data — from duoke_shop_performance (Jan 1–Feb 24 2026) ─
// chats = monthly average (YTD ÷ 1.807 months). perf = raw YTD totals for reference.
// perf[platform] = {chats, replied, customers, avgResp, conv, amount, rating}
const CS_BRANDS_INIT = [
  {id:"b01",name:"111SKIN-IN",             wh:"IN",  group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:998,  Lazada:457,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:826, replied:778, customers:373, avgResp:6,   conv:6.03, amount:190336,  rating:"100"},shopee:{chats:1803, replied:1603,customers:1245,avgResp:10, conv:8.23, amount:577209,  rating:null}}},
  {id:"b02",name:"AESTURA-Amor",           wh:"IN",  group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:2610, Lazada:648,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:1171,replied:1089,customers:471, avgResp:13,  conv:10.8, amount:71471,   rating:"99"}, shopee:{chats:4717, replied:4302,customers:2586,avgResp:23, conv:10.68,amount:212223,  rating:null}}},
  {id:"b03",name:"Acne Aid and Spectraban-IN",wh:"IN",group:"",platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:4667, Lazada:1160, Tiktok:1158, Line:0,Amaze:0}, perf:{lazada:{chats:2097,replied:1933,customers:1229,avgResp:1,   conv:14.63,amount:177752,  rating:"100"},shopee:{chats:8434, replied:6480,customers:5921,avgResp:14, conv:12.1, amount:335073,  rating:null}, tiktok:{chats:2093,replied:1875,customers:1504,avgResp:0,   conv:7.11, amount:43203,   rating:"50"}}},
  {id:"b04",name:"Armani Exchange-CMG",    wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:615,  Lazada:550,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:994, replied:932, customers:415, avgResp:0,   conv:10.34,amount:271107,  rating:"99"}, shopee:{chats:1112, replied:976, customers:709, avgResp:4,   conv:12.6, amount:632238,  rating:null}}},
  {id:"b05",name:"Banila-CMG",             wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:1996, Lazada:632,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:1142,replied:1008,customers:601, avgResp:2,   conv:10.1, amount:97640,   rating:"100"},shopee:{chats:3606, replied:2838,customers:2684,avgResp:6,   conv:12.28,amount:242887,  rating:null}}},
  {id:"b06",name:"Calvin Klein-MY PVH",    wh:"PVH", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:2065, Lazada:2169, Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:3731,replied:3658,customers:2559,avgResp:40,  conv:8.36, amount:555493,  rating:null}, lazada:{chats:3920,replied:3698,customers:2521,avgResp:30,  conv:15.81,amount:2407625, rating:"98"}}},
  {id:"b07",name:"Calvin Klein-SG PVH",    wh:"PVH", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:651,  Lazada:452,  Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:1176,replied:1139,customers:880, avgResp:null,conv:10.31,amount:260134,  rating:null}, lazada:{chats:817, replied:746, customers:467, avgResp:3,   conv:12.93,amount:265106,  rating:"98"}}},
  {id:"b08",name:"Casio-CMG",              wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:17617,Lazada:2053, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:3709,replied:3218,customers:2603,avgResp:6,   conv:9.0,  amount:667718,  rating:"99"}, shopee:{chats:31833,replied:25458,customers:24058,avgResp:3,  conv:10.86,amount:4006486, rating:null}}},
  {id:"b09",name:"Clarins-CMG",            wh:"CMG", group:"", platforms:["Lazada"],                   chats:{Shopee:0,    Lazada:2592, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:4684,replied:4120,customers:2440,avgResp:29,  conv:13.76,amount:1998843, rating:"98"}}},
  {id:"b10",name:"Crocs-CMG",              wh:"CMG", group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:39272,Lazada:4574, Tiktok:3434, Line:0,Amaze:0}, perf:{lazada:{chats:8265,replied:7387,customers:5787,avgResp:6,   conv:10.6, amount:1481583, rating:"99"}, shopee:{chats:70963,replied:60757,customers:51222,avgResp:3,  conv:12.19,amount:10672876,rating:null}, tiktok:{chats:6206,replied:5006,customers:4642,avgResp:0,   conv:9.25, amount:661813,  rating:"80"}}},
  {id:"b11",name:"Decathlon Thailand",     wh:"Deca",group:"2",platforms:["Shopee"],                   chats:{Shopee:14160,Lazada:0,    Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:25586,replied:20554,customers:18498,avgResp:4,  conv:15.55,amount:2834201, rating:null}}},
  {id:"b12",name:"Dettol-IN",              wh:"IN",  group:"", platforms:["Tiktok"],                   chats:{Shopee:0,    Lazada:0,    Tiktok:2284, Line:0,Amaze:0}, perf:{tiktok:{chats:4128,replied:3760,customers:2920,avgResp:0,   conv:5.15, amount:188486,  rating:"100"}}},
  {id:"b13",name:"Durex-IN",               wh:"IN",  group:"", platforms:["Tiktok"],                   chats:{Shopee:0,    Lazada:0,    Tiktok:377,  Line:0,Amaze:0}, perf:{tiktok:{chats:681, replied:620, customers:603, avgResp:0,   conv:3.99, amount:5400,    rating:null}}},
  {id:"b14",name:"Fila-CMG",               wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:9411, Lazada:1925, Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:17005,replied:14746,customers:13384,avgResp:5,  conv:12.13,amount:1487434, rating:null}, lazada:{chats:3478,replied:3205,customers:2466,avgResp:3,   conv:11.82,amount:352246,  rating:"99"}}},
  {id:"b15",name:"FitFlop - CMG",          wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:15804,Lazada:2565, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:4635,replied:4149,customers:3151,avgResp:4,   conv:8.02, amount:690474,  rating:"99"}, shopee:{chats:28557,replied:24560,customers:18910,avgResp:2,  conv:13.24,amount:5402969, rating:null}}},
  {id:"b16",name:"G2000 - CMG",            wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:5973, Lazada:2492, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:4503,replied:4094,customers:2426,avgResp:11,  conv:13.62,amount:1496076, rating:"99"}, shopee:{chats:10793,replied:9268,customers:6422,avgResp:2,   conv:18.39,amount:2748320, rating:null}}},
  {id:"b17",name:"Guess-CMG TH",           wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:9877, Lazada:1303, Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:17847,replied:15325,customers:11666,avgResp:3,  conv:12.74,amount:2891227, rating:null}, lazada:{chats:2354,replied:2098,customers:1387,avgResp:4,   conv:7.85, amount:299833,  rating:"99"}}},
  {id:"b18",name:"Hill's-IN",              wh:"IN",  group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:4277, Lazada:716,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:1294,replied:1213,customers:693, avgResp:2,   conv:11.74,amount:142061,  rating:"100"},shopee:{chats:7728, replied:6650,customers:5063,avgResp:6,   conv:13.27,amount:926045,  rating:null}}},
  {id:"b19",name:"Heydude-CMG",            wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:857,  Lazada:257,  Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:1549,replied:1301,customers:1068,avgResp:1,   conv:13.38,amount:242747,  rating:null}, lazada:{chats:464, replied:433, customers:150, avgResp:6,   conv:5.67, amount:14888,   rating:"100"}}},
  {id:"b20",name:"Hush Puppies - CMG",     wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:5381, Lazada:1066, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:1927,replied:1785,customers:1158,avgResp:10,  conv:10.98,amount:226643,  rating:"99"}, shopee:{chats:9723, replied:7648,customers:6546,avgResp:3,   conv:15.6, amount:1211857, rating:null}}},
  {id:"b21",name:"JDE-IN",                 wh:"IN",  group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:5430, Lazada:1696, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:3065,replied:2780,customers:1725,avgResp:7,   conv:8.77, amount:194243,  rating:"100"},shopee:{chats:9812, replied:7946,customers:5850,avgResp:8,   conv:12.43,amount:845018,  rating:null}}},
  {id:"b22",name:"JUNGSAEMMOOL-CMG",       wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:10939,Lazada:3793, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:6854,replied:5859,customers:4332,avgResp:5,   conv:13.27,amount:1114371, rating:"98"}, shopee:{chats:19766,replied:16044,customers:13205,avgResp:2,  conv:14.49,amount:2476573, rating:null}}},
  {id:"b23",name:"Jockey - CMG",           wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:2112, Lazada:616,  Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:3817,replied:2685,customers:2490,avgResp:1,   conv:13.94,amount:211988,  rating:null}, lazada:{chats:1114,replied:1012,customers:606, avgResp:24,  conv:12.77,amount:94189,   rating:"99"}}},
  {id:"b24",name:"KIKO - CMG",             wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:4724, Lazada:1210, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:2186,replied:1946,customers:1381,avgResp:4,   conv:10.96,amount:180442,  rating:"100"},shopee:{chats:8536, replied:6958,customers:6316,avgResp:3,   conv:9.01, amount:447694,  rating:null}}},
  {id:"b25",name:"LEE - CMG",              wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:7894, Lazada:1582, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:2858,replied:2414,customers:1896,avgResp:6,   conv:10.47,amount:231636,  rating:"99"}, shopee:{chats:14264,replied:11095,customers:10062,avgResp:2,  conv:14.43,amount:1099983, rating:null}}},
  {id:"b26",name:"MLB - CMG",              wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:11582,Lazada:1821, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:3291,replied:2966,customers:2042,avgResp:8,   conv:12.72,amount:899477,  rating:"98"}, shopee:{chats:20928,replied:17250,customers:14688,avgResp:2,  conv:13.84,amount:4325107, rating:null}}},
  {id:"b27",name:"Mondelez-IN",            wh:"IN",  group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:1563, Lazada:472,  Tiktok:260,  Line:0,Amaze:0}, perf:{lazada:{chats:852, replied:804, customers:422, avgResp:12,  conv:5.94, amount:23732,   rating:"100"},tiktok:{chats:469, replied:437, customers:271, avgResp:0,   conv:5.12, amount:10363,   rating:null}, shopee:{chats:2825, replied:2176,customers:1587,avgResp:11,  conv:12.25,amount:181594,  rating:null}}},
  {id:"b28",name:"Nescafe Dolce Gusto-IN", wh:"IN",  group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:10703,Lazada:1697, Tiktok:2684, Line:0,Amaze:0}, perf:{lazada:{chats:3066,replied:2832,customers:1846,avgResp:10,  conv:11.35,amount:530801,  rating:"100"},shopee:{chats:19340,replied:16489,customers:11345,avgResp:2,  conv:14.51,amount:3700089, rating:null}, tiktok:{chats:4850,replied:4348,customers:2904,avgResp:null,conv:10.65,amount:613884,  rating:null}}},
  {id:"b29",name:"Nespresso-IN",           wh:"IN",  group:"", platforms:["Tiktok"],                   chats:{Shopee:0,    Lazada:0,    Tiktok:170,  Line:0,Amaze:0}, perf:{tiktok:{chats:307, replied:286, customers:225, avgResp:0,   conv:1.88, amount:22261,   rating:null}}},
  {id:"b30",name:"Nestle PetCare-IN",      wh:"IN",  group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:6116, Lazada:961,  Tiktok:818,  Line:0,Amaze:0}, perf:{lazada:{chats:1736,replied:1509,customers:995, avgResp:3,   conv:10.97,amount:277571,  rating:"100"},shopee:{chats:11051,replied:8352, customers:7385,avgResp:3,   conv:12.04,amount:685284,  rating:null}, tiktok:{chats:1478,replied:1087,customers:1085,avgResp:0,   conv:4.73, amount:30251,   rating:"100"}}},
  {id:"b31",name:"Paul Smith-CMG",         wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:801,  Lazada:993,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:1795,replied:1656,customers:911, avgResp:8,   conv:13.81,amount:765523,  rating:"99"}, shopee:{chats:1447, replied:1199,customers:854, avgResp:2,   conv:13.32,amount:585933,  rating:null}}},
  {id:"b32",name:"Pedigree & Whiskas-IN",  wh:"IN",  group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:7459, Lazada:1872, Tiktok:4021, Line:0,Amaze:0}, perf:{lazada:{chats:3382,replied:2875,customers:2114,avgResp:4,   conv:9.83, amount:209824,  rating:"100"},tiktok:{chats:7265,replied:5808,customers:4974,avgResp:null,conv:8.42, amount:289482,  rating:null}, shopee:{chats:13479,replied:10709,customers:8845,avgResp:3,  conv:11.44,amount:678954,  rating:null}}},
  {id:"b33",name:"Polo Ralph Lauren-CMG",  wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:6562, Lazada:1484, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:2681,replied:2479,customers:1488,avgResp:20,  conv:7.83, amount:1005880, rating:"99"}, shopee:{chats:11858,replied:10390,customers:6696,avgResp:1,   conv:13.46,amount:5037945, rating:null}}},
  {id:"b34",name:"Revlon-IN",              wh:"IN",  group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:1376, Lazada:371,  Tiktok:489,  Line:0,Amaze:0}, perf:{shopee:{chats:2486,replied:2223,customers:1999,avgResp:2,   conv:9.14, amount:69790,   rating:null}, tiktok:{chats:884, replied:846, customers:712, avgResp:0,   conv:7.26, amount:12635,   rating:"100"},lazada:{chats:671, replied:600, customers:433, avgResp:7,   conv:8.51, amount:41430,   rating:"99"}}},
  {id:"b35",name:"Smart-Travel - TOG",     wh:"TOG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:478,  Lazada:244,  Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:441, replied:423, customers:118, avgResp:0,   conv:9.35, amount:31924,   rating:"100"},shopee:{chats:864,  replied:748, customers:608, avgResp:4,   conv:12.07,amount:200043,  rating:null}}},
  {id:"b36",name:"THREE - CMG",            wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:1563, Lazada:1003, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:1812,replied:1512,customers:1020,avgResp:10,  conv:15.41,amount:399727,  rating:"100"},shopee:{chats:2825, replied:2083,customers:1894,avgResp:4,   conv:15.22,amount:544589,  rating:null}}},
  {id:"b37",name:"TOMMY -CMG",             wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:3382, Lazada:2126, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:3842,replied:3456,customers:2114,avgResp:14,  conv:15.07,amount:926310,  rating:"99"}, shopee:{chats:6112, replied:5157,customers:4086,avgResp:2,   conv:13.42,amount:920991,  rating:null}}},
  {id:"b38",name:"The North Face - TOG",   wh:"TOG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:7853, Lazada:2840, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:5131,replied:4446,customers:3374,avgResp:9,   conv:8.51, amount:1412100, rating:"99"}, shopee:{chats:14191,replied:12059,customers:9273,avgResp:4,   conv:10.81,amount:4200732, rating:null}}},
  {id:"b39",name:"Tinder-IN",              wh:"IN",  group:"1",platforms:["Shopee","Lazada"],          chats:{Shopee:6883, Lazada:1550, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:2800,replied:2607,customers:1961,avgResp:12,  conv:4.28, amount:28826,   rating:"95"}, shopee:{chats:12438,replied:11434,customers:10297,avgResp:7,  conv:3.66, amount:125130,  rating:null}}},
  {id:"b40",name:"Tommy Hilfiger-MY PVH",  wh:"PVH", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:1911, Lazada:1556, Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:3453,replied:3398,customers:2383,avgResp:43,  conv:7.95, amount:468664,  rating:null}, lazada:{chats:2812,replied:2632,customers:1766,avgResp:7,   conv:12.77,amount:1594699, rating:"99"}}},
  {id:"b41",name:"Tommy Hilfiger-SG PVH",  wh:"PVH", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:607,  Lazada:525,  Tiktok:0,    Line:0,Amaze:0}, perf:{shopee:{chats:1097,replied:1083,customers:774, avgResp:null,conv:14.3, amount:433548,  rating:null}, lazada:{chats:948, replied:845, customers:569, avgResp:3,   conv:12.71,amount:538059,  rating:"99"}}},
  {id:"b42",name:"ULTIMA II-IN",           wh:"IN",  group:"", platforms:["Shopee","Lazada","Tiktok"], chats:{Shopee:35,   Lazada:80,   Tiktok:6,    Line:0,Amaze:0}, perf:{tiktok:{chats:10,  replied:10,  customers:9,   avgResp:null,conv:22.22,amount:214,     rating:null}, shopee:{chats:63,   replied:59,  customers:51,  avgResp:0,   conv:6.38, amount:1290,    rating:null}, lazada:{chats:144, replied:137, customers:16,  avgResp:0,   conv:0,    amount:0,       rating:"100"}}},
  {id:"b43",name:"Wrangler - CMG",         wh:"CMG", group:"", platforms:["Shopee","Lazada"],          chats:{Shopee:7179, Lazada:1215, Tiktok:0,    Line:0,Amaze:0}, perf:{lazada:{chats:2196,replied:1894,customers:1350,avgResp:13,  conv:10.36,amount:190551,  rating:"99"}, shopee:{chats:12973,replied:10474,customers:8651,avgResp:2,   conv:14.1, amount:1542941, rating:null}}},
];


function allocLocalStr(dt){
  return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
}
function allocMkDates(year,month){
  const out=[];
  const start=new Date(year,month-1,1);
  const end=new Date(year,month,0); // last day of the month
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    const dt=new Date(d);const wd=dt.getDay();
    out.push({date:allocLocalStr(dt),day:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][wd],wd,isWE:wd===0||wd===6,dd:dt.getDate(),mm:dt.getMonth()+1});
  }
  return out;
}
// Generate all dates in a range (for date-range filter)
function mkDateRange(from, to) {
  const out=[];
  if(!from||!to) return out;
  const start=new Date(from), end=new Date(to);
  if(start>end) return out;
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    const dt=new Date(d);const wd=dt.getDay();
    out.push({date:allocLocalStr(dt),day:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][wd],wd,isWE:wd===0||wd===6,dd:dt.getDate(),mm:dt.getMonth()+1});
  }
  return out;
}
// Read per-month chat volume for a brand+platform from monthlyVol, falling
// back to brand.chats global default if no per-month entry exists.
// Allocation and auto-fill use this so each month routes through its own
// imported numbers, with a sensible default for unimported months.
// Which imported month should mk read volume from? Exact month if imported;
// otherwise the most recent imported month before it (so planning future
// months runs on the latest real performance data); otherwise the most
// recent import at all; null if nothing was ever imported.
function getVolSourceMk(monthlyVol, mk) {
  if (!monthlyVol || !mk) return null;
  if (monthlyVol[mk]) return mk;
  const keys = Object.keys(monthlyVol).sort();
  const before = keys.filter(k => k < mk);
  if (before.length) return before[before.length - 1];
  return keys.length ? keys[keys.length - 1] : null;
}
function getBrandChats(brand, platform, monthlyVol, mk) {
  if (!brand) return 0;
  const src = getVolSourceMk(monthlyVol, mk);
  const fromMonth = src ? monthlyVol[src]?.[brand.id]?.[platform] : undefined;
  if (fromMonth !== undefined && fromMonth !== null) return fromMonth;
  return brand.chats?.[platform] || 0;
}

function allocAutoFill(agents, dates, flags) {
  // Use the same fair constrained logic with no constraints
  return allocAutoFillConstrained(agents, dates, flags, { needM:0, needME:0, needE:0 }, []);
}


// Auto-allocate brands to T1 agents — balanced by chat volume (fewest-chats-first greedy)
// Key format: brandId_date_shift_platform
// Auto-allocate: 1 agent per brand+platform, balanced by chat volume (greedy fewest-load-first)
// Always starts completely fresh. Additional agents can be added manually afterward.
// FIX (round-7 follow-up): added monthlyVol+mk parameters so the function
// can read per-month chat volumes. Callers pass the active roster month so
// brand allocation reflects THIS month's chat data (when imported per-month)
// instead of the global brand defaults.
function autoAllocateBrands(brands, agents, asgn, dates, brandAsgn, monthlyVol, mk) {
  const result = {};
  const t1Agents = agents.filter(a => a.active && a.team === "T1");

  // Sort brands by total volume — per-month aware via getBrandChats
  const brandVol = {};
  brands.forEach(b => {
    brandVol[b.id] = (b.platforms||[]).reduce((s,p) => s + getBrandChats(b, p, monthlyVol, mk), 0);
  });
  const sortedBrandIds = brands.map(b=>b.id).sort((a,b) => (brandVol[b]||0) - (brandVol[a]||0));

  // Top 30% = high volume (ME eligible)
  const highVolCount = Math.max(3, Math.ceil(sortedBrandIds.length * 0.3));
  const highVolBrands = new Set(sortedBrandIds.slice(0, highVolCount));

  // Top 3 brands by volume get multi-agent assignment (2-3 agents)
  const top3 = new Set(sortedBrandIds.slice(0, 3));

  dates.forEach(d => {
    const working = {M:[], ME:[], E:[]};
    t1Agents.forEach(ag => {
      const v = asgn[`${ag.id}_${d.date}`];
      if(!v || v==="Off" || v==="TOIL") return;
      if(v==="M") working.M.push(ag);
      if(v==="ME") working.ME.push(ag);
      if(v==="E") working.E.push(ag);
    });

    // FIX (brand Start Date): only consider brands whose startDate is on or
    // before this date. A brand with a future startDate is not yet active,
    // so it gets no agents until that date arrives. Brands without a
    // startDate are always active (no restriction).
    const dateBrands = brands.filter(b => !b.startDate || b.startDate <= d.date);

    ["M","E"].forEach(shift => {
      const shiftPool = shift==="M" ? working.M : working.E;
      const mePool = working.ME;
      const allPool = [...shiftPool, ...mePool];
      if(!allPool.length) return;

      // Determine how many agents top brands get based on shift pool size
      const totalWorking = allPool.length;
      const topBrandAgents = totalWorking >= 6 ? 3 : totalWorking >= 4 ? 2 : Math.min(2, totalWorking);

      // Build tasks sorted by volume desc — per-month aware
      // FIX (zero-chat coverage): if a brand has 0 chats this month but is
      // NOT offboarded, it still needs an agent assigned so that when chats
      // DO come in there's someone covering. We use a sentinel volume of
      // 0.01 — this sorts the task to the very bottom (real-volume brands
      // get priority for the strongest agents) but the brand still gets
      // exactly one agent slot per platform. Offboarded brands were already
      // filtered out at the top of allocAutoFillConstrained.
      const tasks = [];
      dateBrands.forEach(b => {
        (b.platforms||[]).forEach(plat => {
          const realVol = getBrandChats(b, plat, monthlyVol, mk);
          const vol = realVol > 0 ? realVol : 0.01;
          // How many agents for this brand+platform — zero-chat brands only
          // get 1 agent regardless of whether they were in top3 historically.
          const agentCount = (realVol > 0 && top3.has(b.id)) ? topBrandAgents : 1;
          tasks.push({ k: `${b.id}_${d.date}_${shift}_${plat}`, vol, brandId: b.id, agentCount });
        });
      });
      tasks.sort((a, b) => b.vol - a.vol);

      // Load tracking
      const load = {};
      allPool.forEach(ag => { load[ag.name] = 0; });

      tasks.forEach(({ k, vol, brandId, agentCount }) => {
        const isHighVol = highVolBrands.has(brandId);
        // ME agents only eligible for high-volume brands
        const eligible = isHighVol ? allPool : (shiftPool.length > 0 ? shiftPool : allPool);
        if(!eligible.length) return;

        // Pick N lightest-loaded agents
        const assigned = [];
        const tempEligible = [...eligible];
        for (let n = 0; n < Math.min(agentCount, tempEligible.length); n++) {
          const lightest = tempEligible.reduce((min, ag) => load[ag.name] < load[min.name] ? ag : min, tempEligible[0]);
          assigned.push(lightest.name);
          load[lightest.name] += vol / agentCount; // Split volume load
          tempEligible.splice(tempEligible.indexOf(lightest), 1);
        }
        result[k] = assigned;
      });
    });
  });
  return result;
}

// Smart Auto-Fill — Fair & Load-Balanced
// Rules:
//   • T2/Return: fixed schedule (holidays Off, unavailable days Off/TOIL)
//   • T1: days-off spread evenly across the month (not random each week)
//     - Each agent works roughly equal days over the period
//     - Days-off are spaced as evenly as possible (not clustered)
//     - Shift assignment respects each agent's allowed shifts
//     - When multiple agents are eligible, always pick the one with fewest days assigned so far
// FIX (round-7 follow-up): added monthlyVol+mk parameters so chat-cap based
// minimum-headcount calculations route through the active roster month's
// imported chat data instead of brand defaults.
function allocAutoFillConstrained(agents, dates, flags, constraints, brands, existing = {}, monthlyVol = {}, mk = null) {
  // FIX (Offboarded brands): exclude any brand flagged offboarded from the
  // allocation pool. They keep their data (chats, history) but the auto-fill
  // skips them entirely so freed agent capacity flows to live brands.
  brands = (brands || []).filter(b => !b?.offboarded);
  const nxt = {};
  // Honor pre-existing manual assignments — they are kept as-is.
  // For "Off" days set by manager (day-off requests), we treat them as fixed days off.
  // Working days already assigned (M/E/ME/TOIL/OT) count toward that agent's day total
  // so fairness in subsequent auto-fill ignores them as "already worked".
  Object.assign(nxt, existing);
  // ── Burnout rule helpers: never auto-assign M after E (only 6h rest) ──
  const prevDateOf = (date) => {
    const x = new Date(date + "T00:00:00Z"); x.setUTCDate(x.getUTCDate()-1);
    return x.toISOString().slice(0,10);
  };
  const wouldBurnout = (agId, date) => nxt[`${agId}_${prevDateOf(date)}`] === "E";
  // ── T2: fixed schedule (they're salaried, just mark their available days) ──
  const t2Only = agents.filter(a => a.active && a.team === "T2");
  t2Only.forEach(ag => {
    dates.forEach(d => {
      const k  = `${ag.id}_${d.date}`;
      const avail = ag.days.includes(d.wd);
      nxt[k] = avail ? (ag.shifts[0] || "M") : "Off";
    });
  });

  // ── Return: fixed schedule (work all available days, no count limits) ─────
  // Return agents have a fixed weekly schedule (e.g. AOF = Mon-Sat).
  // They are NOT subject to the auto-fill count limits or day-off staggering.
  const returnOnly = agents.filter(a => a.active && (a.team === "Return" || a.team === "CC"));
  returnOnly.forEach(ag => {
    dates.forEach(d => {
      const k  = `${ag.id}_${d.date}`;
      const avail = ag.days.includes(d.wd);
      nxt[k] = avail ? (ag.shifts[0] || "M") : "Off";
    });
  });

  // ── T1: daily rate agents — auto-fill with count limits ──────────────────
  // They get 1 day off per week, spread evenly across the month.
  // Return agents are excluded here so they don't count against T1 quotas.
  const t1  = agents.filter(a => a.active && a.team === "T1");

  // ── T1: compute fair days-off spread across the entire period ────────────
  // For each agent, figure out their available days, then space out OFF days
  // evenly rather than randomly, so no agent gets a bad cluster of days off.

  const forcedOff = {}; // `${agId}_${date}` → true

  t1.forEach((ag, agIdx) => {
    // All dates this agent is physically available (days[] includes this weekday)
    const available = dates.filter(d => ag.days.includes(d.wd));
    const unavailable = dates.filter(d => !ag.days.includes(d.wd));

    // Unavailable days are always Off
    unavailable.forEach(d => { forcedOff[`${ag.id}_${d.date}`] = true; });

    // Group available days into Mon-start weeks
    const weekMap = [];
    let cw = [];
    available.forEach(d => {
      if (d.wd === 1 && cw.length > 0) { weekMap.push([...cw]); cw = []; }
      cw.push(d);
    });
    if (cw.length > 0) weekMap.push(cw);

    // Stagger off-days: each agent uses a different starting offset (agIdx)
    // so agents are NEVER all off on the same day.
    // Agent 0: off on pos 0,1,2... Agent 1: off on pos 1,2,3... Agent 2: off on pos 2,3,4...
    weekMap.forEach((week, wi) => {
      if (week.length === 0) return;
      // Stagger by both week index AND agent index so no two agents share the same off day
      const offIdx = (wi + agIdx) % week.length;
      forcedOff[`${ag.id}_${week[offIdx].date}`] = true;
    });
  });

  // ── T1: load-balanced daily assignment ────────────────────────────────────
  // Track assigned day count per agent so we always pick the least-used agent first.
  // Pre-existing manual working days (M/E/ME) count toward each agent's tally so
  // an agent with many manual assignments gets proportionally fewer auto-filled days.
  const dayCount = {};
  t1.forEach(ag => {
    let n = 0;
    dates.forEach(d => {
      const v = existing[`${ag.id}_${d.date}`];
      if (v && (v === "M" || v === "E" || v === "ME")) n++;
    });
    dayCount[ag.id] = n;
  });
  // Track each agent's MOST RECENT working shift (M / ME / E) so we can flip after a day off.
  // Fairness rule: after Off, the agent should switch the opposite shift (M ↔ E).
  // If they're shift-locked (e.g. M-only or E-only) we can't alternate — they just get their only shift.
  const lastShift = {};
  t1.forEach(ag => {
    let last = null;
    // Walk dates in order; remember the most recent existing M/E/ME assignment
    dates.forEach(d => {
      const v = existing[`${ag.id}_${d.date}`];
      if (v === "M" || v === "E" || v === "ME") last = v;
    });
    lastShift[ag.id] = last;
  });

  // Also track shift rotation per agent: which shift index to use next
  const shiftIdx = {};
  t1.forEach(ag => { shiftIdx[ag.id] = 0; });

  dates.forEach(d => {
    const fl = flags[d.date];
    const dc = constraints.dateOverrides?.[d.date];

    const needMRaw  = dc != null ? (dc.needM  ?? 0) : (constraints.needM  ?? 0);
    const needMERaw = dc != null ? (dc.needME ?? 0) : (constraints.needME ?? 0);
    const needERaw  = dc != null ? (dc.needE  ?? 0) : (constraints.needE  ?? 0);
    // FIX (coverage floor): when the manager hasn't set explicit per-shift
    // minimums in the Auto-Fill modal, the old code defaulted to 0 — which
    // meant Sunday could end up with 0 evening coverage and nobody on chats.
    // Now: if needM or needE come in as 0, fall back to a sensible portion
    // of the available pool (30% M, 25% E, both floored at minimums) so
    // there's always SOMEONE on every shift the day allows.
    const t1Available = t1.filter(a =>
      a.days.includes(d.wd) && !forcedOff[`${a.id}_${d.date}`]
    ).length;
    const defaultMinM = Math.max(2, Math.ceil(t1Available * 0.30));
    const defaultMinE = Math.max(1, Math.ceil(t1Available * 0.25));
    const needM  = needMRaw  > 0 ? needMRaw  : defaultMinM;
    const needME = needMERaw; // ME stays explicit — only set when high-vol crossover is wanted
    const needE  = needERaw  > 0 ? needERaw  : defaultMinE;
    const budgetCap = dc?.budget != null ? dc.budget
                    : constraints.dailyBudget != null ? constraints.dailyBudget : null;
    const chatCap = constraints.chatPerAgent ?? null;

    // Total brand chat load for this day
    let totalDailyChats = 0;
    brands.forEach(b =>
      // FIX (round-7 follow-up): per-month chat volume so chatCap-based min
      // headcount uses the active month's actual import, not brand defaults.
      (b.platforms || []).forEach(p => { totalDailyChats += getBrandChats(b, p, monthlyVol, mk); })
    );

    // Split agents into available (can work today) and unavailable (forced off).
    // Also treat manager-set Off / TOIL / OT entries in `existing` as fixed — skip them.
    const isFixed = (a) => {
      const v = existing[`${a.id}_${d.date}`];
      return v === "Off" || v === "TOIL" || v === "OT" || v === "M" || v === "ME" || v === "E";
    };
    const unavail = t1.filter(a => !a.days.includes(d.wd) || forcedOff[`${a.id}_${d.date}`]);
    const avail   = t1.filter(a =>  a.days.includes(d.wd) && !forcedOff[`${a.id}_${d.date}`] && !isFixed(a));

    unavail.forEach(ag => { if (!existing[`${ag.id}_${d.date}`]) nxt[`${ag.id}_${d.date}`] = "Off"; });
    if (!avail.length) return;

    // Sort available agents by ascending day count (fewest days worked first = fairest)
    // Tie-break: stable original order (preserves roster order for same count)
    const pool = [...avail].sort((a, b) => dayCount[a.id] - dayCount[b.id]);

    const minNeeded = Math.max(
      1, // always schedule at least 1 agent per day
      needM + needME + needE,
      chatCap != null && chatCap > 0 ? Math.ceil(totalDailyChats / chatCap) : 0
    );

    let budgetUsed = 0;
    let assigned   = 0;
    let coveredM = 0, coveredME = 0, coveredE = 0;

    // Pass 1: fill required shift slots — match agents to shifts they can do
    // First fill ME slots (most restrictive), then M, then E
    const unassigned = [...pool];

    // Fill ME slots first
    for (let i = 0; i < unassigned.length && coveredME < needME; i++) {
      const ag = unassigned[i];
      const k = `${ag.id}_${d.date}`;
      if (nxt[k]) continue;
      if (budgetCap != null && budgetUsed + ag.costDay > budgetCap) continue;
      if (!ag.shifts.includes("ME")) continue;
      nxt[k] = "ME"; budgetUsed += ag.costDay; assigned++; dayCount[ag.id]++; lastShift[ag.id] = "ME"; coveredME++;
      unassigned.splice(i, 1); i--;
    }

    // Fill M slots — prefer (1) agents whose previous shift was E or ME (alternate after off),
    // then (2) agents who can ONLY do M (most constrained first).
    const mPool = unassigned.filter(a => a.shifts.includes("M")).sort((a,b) => {
      const aAlt = (lastShift[a.id] === "E" || lastShift[a.id] === "ME") ? 0 : (lastShift[a.id] === "M" ? 2 : 1);
      const bAlt = (lastShift[b.id] === "E" || lastShift[b.id] === "ME") ? 0 : (lastShift[b.id] === "M" ? 2 : 1);
      if (aAlt !== bAlt) return aAlt - bAlt;
      return a.shifts.length - b.shifts.length;
    });
    for (const ag of mPool) {
      // FIX: was `coveredM + coveredME >= needM` which counted 1 ME agent as filling 1 M slot,
      // so requesting M=4 ME=1 only assigned 3 M agents. Now M and ME are independent counts.
      if (coveredM >= needM) break;
      const k = `${ag.id}_${d.date}`;
      if (nxt[k]) continue;
      if (budgetCap != null && budgetUsed + ag.costDay > budgetCap) continue;
      if (wouldBurnout(ag.id, d.date)) continue; // skip: agent worked E yesterday
      nxt[k] = "M"; budgetUsed += ag.costDay; assigned++; dayCount[ag.id]++; lastShift[ag.id] = "M"; coveredM++;
      const idx = unassigned.indexOf(ag); if (idx>=0) unassigned.splice(idx, 1);
    }

    // Fill E slots — prefer (1) agents whose previous shift was M or ME (alternate after off),
    // then (2) agents who can ONLY do E (most constrained first).
    const ePool = unassigned.filter(a => a.shifts.includes("E")).sort((a,b) => {
      const aAlt = (lastShift[a.id] === "M" || lastShift[a.id] === "ME") ? 0 : (lastShift[a.id] === "E" ? 2 : 1);
      const bAlt = (lastShift[b.id] === "M" || lastShift[b.id] === "ME") ? 0 : (lastShift[b.id] === "E" ? 2 : 1);
      if (aAlt !== bAlt) return aAlt - bAlt;
      return a.shifts.length - b.shifts.length;
    });
    for (const ag of ePool) {
      // FIX: was `coveredE + coveredME >= needE` (ME double-counted as E).
      // Now E is its own count so requesting M=4 ME=1 E=4 produces exactly 4+1+4=9.
      if (coveredE >= needE) break;
      const k = `${ag.id}_${d.date}`;
      if (nxt[k]) continue;
      if (budgetCap != null && budgetUsed + ag.costDay > budgetCap) continue;
      nxt[k] = "E"; budgetUsed += ag.costDay; assigned++; dayCount[ag.id]++; lastShift[ag.id] = "E"; coveredE++;
      const idx = unassigned.indexOf(ag); if (idx>=0) unassigned.splice(idx, 1);
    }

    // If still short on M, try ME-capable agents for M coverage
    const mFill = unassigned.filter(a => a.shifts.includes("ME") || a.shifts.includes("M"));
    for (const ag of mFill) {
      if (coveredM >= needM) break;  // FIX: same as above — no ME double-counting
      const k = `${ag.id}_${d.date}`;
      if (nxt[k]) continue;
      if (budgetCap != null && budgetUsed + ag.costDay > budgetCap) continue;
      const shift = ag.shifts.includes("M") ? "M" : "ME";
      if (shift === "M" && wouldBurnout(ag.id, d.date)) continue; // skip: agent worked E yesterday
      nxt[k] = shift; budgetUsed += ag.costDay; assigned++; dayCount[ag.id]++; lastShift[ag.id] = shift;
      if (shift === "ME") coveredME++; else coveredM++;
      const idx = unassigned.indexOf(ag); if (idx>=0) unassigned.splice(idx, 1);
    }

    // If still short on E, try ME-capable agents for E coverage
    const eFill = unassigned.filter(a => a.shifts.includes("ME") || a.shifts.includes("E"));
    for (const ag of eFill) {
      if (coveredE >= needE) break;  // FIX: same as above — no ME double-counting
      const k = `${ag.id}_${d.date}`;
      if (nxt[k]) continue;
      if (budgetCap != null && budgetUsed + ag.costDay > budgetCap) continue;
      const shift = ag.shifts.includes("E") ? "E" : "ME";
      nxt[k] = shift; budgetUsed += ag.costDay; assigned++; dayCount[ag.id]++; lastShift[ag.id] = shift;
      if (shift === "ME") coveredME++; else coveredE++;
      const idx = unassigned.indexOf(ag); if (idx>=0) unassigned.splice(idx, 1);
    }

    // Pass 2: remaining agents — assign or give Off.
    // FIX: when the manager has set an explicit shift quota (needM + needME + needE > 0),
    // Pass 1 already met that quota EXACTLY. Pass 2 used to push extras in via
    // `shifts[shiftIdx % length]`, defaulting most M-only agents to M and
    // inflating the M count. Now we only top up to minNeeded when the user
    // has NOT set explicit shift counts (so chatCap-driven minimums still work).
    const userSetQuota = (needM + needME + needE) > 0;
    const stillLeft = pool.filter(ag => !nxt[`${ag.id}_${d.date}`])
                          .sort((a, b) => dayCount[a.id] - dayCount[b.id]);

    stillLeft.forEach(ag => {
      const k = `${ag.id}_${d.date}`;
      // If user set a quota, the quota IS the schedule — anyone left over is Off.
      if (userSetQuota)                                       { nxt[k] = "Off"; return; }
      if (assigned >= minNeeded)                              { nxt[k] = "Off"; return; }
      if (budgetCap != null && budgetUsed + ag.costDay > budgetCap) { nxt[k] = "Off"; return; }

      // Rotate through agent's available shifts
      const s = ag.shifts;
      const shift = s[shiftIdx[ag.id] % s.length];
      nxt[k] = shift;
      budgetUsed += ag.costDay;
      assigned++;
      dayCount[ag.id]++;
      shiftIdx[ag.id]++;
    });

    // Any still-unassigned available agents → Off
    avail.forEach(ag => {
      const k = `${ag.id}_${d.date}`;
      if (!nxt[k]) nxt[k] = "Off";
    });
  });

  return nxt;
}


// ── Month Picker Component ───────────────────────────────────────────────────
function MonthPicker({ rosterYear, setRosterYear, rosterMonth, setRosterMonth, MONTHS }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <button onClick={()=>{let m=rosterMonth-1,y=rosterYear;if(m<1){m=12;y--;}setRosterMonth(m);setRosterYear(y);}}
        style={{width:28,height:28,borderRadius:7,border:"1px solid #E2E8F0",background:"#fff",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
      <div style={{background:"#fff",border:"1px solid #E2E8F0",borderRadius:8,padding:"6px 16px",fontSize:13,fontWeight:600,color:"#0F172A",minWidth:110,textAlign:"center"}}>
        {MONTHS[rosterMonth-1]} {rosterYear}
      </div>
      <button onClick={()=>{let m=rosterMonth+1,y=rosterYear;if(m>12){m=1;y++;}setRosterMonth(m);setRosterYear(y);}}
        style={{width:28,height:28,borderRadius:7,border:"1px solid #E2E8F0",background:"#fff",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
    </div>
  );
}

// ── Per-domain storage schema ─────────────────────────────────────────────
// Single source of truth for the per-domain key split. flushSave, the mount
// load, the migration seed, and the realtime resync subscriber all iterate
// this list — drift between them is the bug that broke the architectural
// fix the first time around.
//   storageKey = top-level JSONB key in app_state.data
//   stateKey   = field name on the in-memory state blob (and on stateRef bag)
//
// The matching React setters live inside the component (closures over
// useState) — the subscriber builds a setterMap from local closures. Keys
// without a setterMap entry (prefs, role, fulltimeSalary) are intentionally
// session-scoped and not synced from foreign tabs.
// FIX (round-8 senior review MEDIUM/A): dropped the `setter: "setX"` string
// field — it was referenced nowhere and created false confidence that adding
// an entry here wired up the setter, when in fact you still have to update
// the in-component setterMap by hand.
const DOMAIN_KEYS = [
  { storageKey: "nirm-agents",         stateKey: "agents"         },
  { storageKey: "nirm-brands",         stateKey: "brands"         },
  { storageKey: "nirm-budget",         stateKey: "budget"         },
  { storageKey: "nirm-monthlyVol",     stateKey: "monthlyVol"     },
  { storageKey: "nirm-agentPerf",      stateKey: "agentPerf"      },
  { storageKey: "nirm-lockedMonths",   stateKey: "lockedMonths"   },
  { storageKey: "nirm-allAsgn",        stateKey: "allAsgn"        },
  { storageKey: "nirm-allExtraHrs",    stateKey: "allExtraHrs"    },
  { storageKey: "nirm-allBrandAsgn",   stateKey: "allBrandAsgn"   },
  { storageKey: "nirm-globalFlags",    stateKey: "globalFlags"    },
  { storageKey: "nirm-changeRequests", stateKey: "changeRequests" },
  { storageKey: "nirm-userProfiles",   stateKey: "userProfiles"   },
  { storageKey: "nirm-fulltimeSalary", stateKey: "fulltimeSalary" },
  { storageKey: "nirm-role",           stateKey: "role"           },
  { storageKey: "nirm-userAccounts",   stateKey: "userAccounts"   },
  { storageKey: "nirm-prefs",          stateKey: "prefs"          },
];

// ── Main Component ─────────────────────────────────────────────────────────
// Browser-tab titles + URL hashes: each view gets its own #hash and tab name
const TAB_TITLES = { roster:"Roster", payment:"My Invoice", allocation:"Allocation", dates:"Dates", volume:"Performance", agents:"Teams", budget:"Report", analytics:"CS Analytics" };

export default function AllocationPanel({ isAdmin = true }) {
  const [allocTab, setAllocTab]     = useState("roster");
  // Hash present when the page was opened (a deliberate deep-link beats saved prefs)
  const initialHash = useRef((window.location.hash || "").replace("#", ""));

  // URL hash -> view (on load + when the user edits the URL / uses back-forward)
  useEffect(() => {
    const fromHash = () => {
      const h = (window.location.hash || "").replace("#", "");
      if (TAB_TITLES[h]) setAllocTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  // view -> URL hash + browser-tab title
  useEffect(() => {
    if (window.location.hash !== "#" + allocTab) window.history.replaceState(null, "", "#" + allocTab);
    document.title = (TAB_TITLES[allocTab] || "NiRM") + " - NiRM Roster";
  }, [allocTab]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agents, setAgents]         = useState(ALLOC_AGENTS_INIT);
  
  const [budget, setBudget]         = useState(ALLOC_BUDGET);
  // T2 monthly salary — per-month object keyed by "YYYY-MM" (e.g. "2026-04": 171730).
  // Manager enters one value per month; range-aware totals look up the right
  // month for each month the date range covers.
  const [fulltimeSalary, setFulltimeSalary] = useState({});
  
  const [editAgent, setEditAgent]   = useState(null);
  const [agentModal, setAgentModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false); // false | "sent" | "error"
  const [inviteFormModal, setInviteFormModal] = useState(false); // agent self-fill form
  const [inviteFormData, setInviteFormData] = useState({
    fullName:"", thaiName:"", phone:"", idCard:"", taxId:"",
    idCardAddress:"", docDeliveryAddress:"", sameAddress:true,
    bankName:"", bankAccount:"", bankAccountName:"",
    startDate:"", costDay:"",
    profilePhotoUrl:"", idCardPhotoUrl:"", bookbankPhotoUrl:""
  });
  const [inviteFormAgentId, setInviteFormAgentId] = useState(null);
  const [cellKey, setCellKey]       = useState(null);
  // Selected date in personal calendar view — shows brand assignments for that day only
  const [selectedRosterDate, setSelectedRosterDate] = useState(null);
  const [dutyOpen, setDutyOpen] = useState(null); // On Duty panel: which colleague row is expanded
  const [mgrReq, setMgrReq] = useState({agentId:"", date:"", shift:"M"}); // Manager/T2 shift-change request form
  const [addFlagDate,  setAddFlagDate]  = useState("");
  const [addFlagType,  setAddFlagType]  = useState("holiday");
  const [addFlagLabel, setAddFlagLabel] = useState("");

  // ── Change Requests (viewer requests, approved by fulltime/manager) ─────
  const [changeRequests, setChangeRequests] = useState([]);
  // {id, agentId, agentName, date, requestedShift, currentShift, reason, status:"pending"|"approved"|"rejected", requestedBy, timestamp}

  // ── User Profiles ─────────────────────────────────────────────────────────
  const [userProfiles, setUserProfiles] = useState({});
  // keyed by lowercase username: { fullName, preferName, bookbank, idCard, lineId, emergencyContact, personalEmail, workEmail }
  const [showProfile, setShowProfile] = useState(false);
  const [reportGroupFilter, setReportGroupFilter] = useState("all");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");

  // ── Role-based access (login screen) ──────────────────────────────────────
  const [role, setRole]             = useState(null); // null = not logged in yet
  // eSign signature pad (drawn signature)
  const [signPadOpen, setSignPadOpen] = useState(false);
  // Stores what we're signing: { agentId, signatureKey }
  const [signPadContext, setSignPadContext] = useState(null);
  const signCanvasRef = useRef(null);
  const signDrawingRef = useRef({ drawing: false, last: null });

  // Top-level save handler that the modal can call (it's outside the invoice IIFE scope)
  const saveSignaturePad = () => {
    const c = signCanvasRef.current;
    if (!c || !signPadContext) return;
    const ctx = c.getContext("2d");
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let drawn = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 255 || pixels[i+1] !== 255 || pixels[i+2] !== 255) { drawn = true; break; }
    }
    if (!drawn) { alert("กรุณาเซ็นชื่อก่อน / Please draw your signature first"); return; }
    const dataUrl = c.toDataURL("image/png");
    const { agentId, signatureKey } = signPadContext;
    setAgents(prev => prev.map(a => a.id === agentId
      ? { ...a, signatures: { ...(a.signatures||{}), [signatureKey]: { dataUrl, signedAt: new Date().toISOString() } } }
      : a
    ));
    setSignPadOpen(false);
    setSignPadContext(null);
    alert("ลงนามเรียบร้อย / Invoice signed.");
  };

  const clearSignaturePad = () => {
    const c = signCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0D9488";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };
  const [loginUser, setLoginUser]   = useState("");
  const [loginPass, setLoginPass]   = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggedIn, setLoggedIn]     = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // {username,password,role} or null

  // Role definitions
  const ROLES = {
    t1:       { label:"T1",              color:"#0D9488", bg:"#F0FDFA", tabs:["roster","payment"],                                                         canEdit:false },
    return:   { label:"RT&RF",           color:"#B91C1C", bg:"#FEE2E2", tabs:["roster","allocation","payment"],                                            canEdit:false },
    viewer:   { label:"Viewer",          color:"#0D9488", bg:"#F0FDFA", tabs:["roster","budget"],                                                          canEdit:false },
    fulltime: { label:"T2",        color:"#065F46", bg:"#ECFDF5", tabs:["roster","payment","allocation","dates","volume","agents"],                canEdit:true  },
    manager:  { label:"Manager",         color:"#92400E", bg:"#FEF3C7", tabs:["roster","agents","allocation","volume","dates","budget","analytics"], canEdit:true  },
    cc:       { label:"CC",              color:"#7C3AED", bg:"#F3E8FF", tabs:["roster","allocation"],                                          canEdit:false, groupScope:"shiseido" },
  };

  // User accounts — stored in state, persisted to storage.
  // SECURITY: starts empty by default. The signed-in Supabase user is added
  // to this list automatically (see App.jsx onAuthStateChange) so there's no
  // public default credential anyone can use.
  const [userAccounts, setUserAccounts] = useState([]);

  const handleLogin = () => {
    const account = userAccounts.find(u => u.username.toLowerCase() === loginUser.toLowerCase() && u.password === loginPass);
    if (!account) { setLoginError("Incorrect username or password."); return; }
    setRole(account.role);
    setLoginUser(account.username);
    setLoggedIn(true);
    setLoginError("");
  };

  const handleLogout = () => {
    // If running under the Supabase wrapper, sign out of Supabase too
    if (typeof window !== "undefined" && window.__nirmSignOut) {
      window.__nirmSignOut();
    }
    setRole(null); setLoggedIn(false); setLoginUser(""); setLoginPass(""); setLoginError("");
    setAllocTab("roster");
  };

  const canEdit = role ? (ROLES[role]?.canEdit ?? false) : false;
  const allowedTabs = role ? (ROLES[role]?.tabs ?? []) : [];

  const [rosterYear,   setRosterYear]   = useState(2026);
  const [rosterMonth,  setRosterMonth]  = useState(4);
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterTeam,   setRosterTeam]   = useState("all");
  const [agentSearch,  setAgentSearch]  = useState("");
  const [agentTeamF,   setAgentTeamF]   = useState("all");

  // Auto-Fill inquiry modal
  const [fillModal,     setFillModal]     = useState(false);
  const [fillMode,      setFillMode]      = useState("fill");
  const [fillNeedM,     setFillNeedM]     = useState(3);
  const [fillNeedME,    setFillNeedME]    = useState(1);
  const [fillNeedE,     setFillNeedE]     = useState(3);
  const [fillBudget,    setFillBudget]    = useState("");
  const [fillChatCap,   setFillChatCap]   = useState("");
  const [fillDateOverrides, setFillDateOverrides] = useState({});
  const [ovDate,   setOvDate]   = useState("");
  const [ovM,      setOvM]      = useState(0);
  const [ovME,     setOvME]     = useState(0);
  const [ovE,      setOvE]      = useState(0);
  const [ovBudget, setOvBudget] = useState("");

  // Allocation tab state
  const [brands, setBrands]           = useState(CS_BRANDS_INIT);
  
  const [brandSearch, setBrandSearch] = useState("");
  const [allocShiftF, setAllocShiftF] = useState("M");
  const [allocDateIdx, setAllocDateIdx] = useState(0);
  const [allocAgentFilter, setAllocAgentFilter] = useState(""); // "" = all agents
  const [brandModal, setBrandModal]   = useState(false);
  const [editBrand, setEditBrand]     = useState(null);
  // Volume tab
  const [volMonth,  setVolMonth]    = useState(3);
  const [volYear,   setVolYear]     = useState(2026);
  const [volViewMode, setVolViewMode] = useState("chats");

  // Sync: Chat Volume section follows the page-level month picker.
  // Changing the top month (rosterMonth/rosterYear) moves the Volume
  // section to the same month; its own arrows still work independently.
  useEffect(() => { setVolMonth(rosterMonth); setVolYear(rosterYear); }, [rosterMonth, rosterYear]);

  // Lock: prevents edits to roster & allocation for a given month
  const [lockedMonths, setLockedMonths] = useState({});

  // Payment period: pay cycle runs 24th of prev month → 23rd of this month
  const [payMonth, setPayMonth] = useState(4);
  const [payYear,  setPayYear]  = useState(2026);
  // Per-agent monthly performance — { [YYYY-MM]: { [agentName_lower]: { replied } } }
  const [agentPerf, setAgentPerf]   = useState({});
  const [monthlyVol, setMonthlyVol] = useState(() => {
    const seed = {};
    CS_BRANDS_INIT.forEach(b => { seed[b.id] = {...(b.chats||{})}; });
    return {"2026-03": seed};
  });

  // ── Storage: flag to avoid writing before initial load completes ──────────
  const [storageLoaded, setStorageLoaded] = useState(false);

  // ── Month key helper ──────────────────────────────────────────────────────
  const mkKey = (y, m) => `${y}-${String(m).padStart(2,"0")}`;
  const currentMK = mkKey(rosterYear, rosterMonth);
  const isLocked = !!lockedMonths[currentMK];

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE — single key "nirm-all" holds EVERYTHING
  // ═══════════════════════════════════════════════════════════════════════════

  const [allAsgn, setAllAsgn] = useState({});
  const [allExtraHrs, setAllExtraHrs] = useState({}); // {mk: {`${agentId}_${date}`: {h, x}}} - extra hours + multiplier
  const [allBrandAsgn, setAllBrandAsgn] = useState({});
  const [globalFlags, setGlobalFlags] = useState(ALLOC_FLAGS_INIT);

  const asgn = allAsgn[currentMK] || {};
  const extraHrs = allExtraHrs[currentMK] || {};
  const brandAsgn = allBrandAsgn[currentMK] || {};
  const flags = globalFlags;

  // ── Master ref — always holds latest state for saving ─────────────────────
  const stateRef = useRef({});
  stateRef.current = {
    agents, brands, budget, fulltimeSalary, monthlyVol, agentPerf, lockedMonths, role, changeRequests, userProfiles, userAccounts,
    prefs: { rosterYear, rosterMonth, allocTab, volYear, volMonth, loginUser },
    allAsgn, allExtraHrs, allBrandAsgn, globalFlags,
  };

  // ── Save: write stateRef.current to storage ───────────────────────────────
  const saveTimer = useRef(null);
  const needsSave = useRef(false);
  // FIX (data-loss bug #5 from senior-dev review):
  // Track the last good snapshot we loaded from storage so the shrink guard
  // can compare against real data, not against an empty defaults blob.
  const lastLoadedSnapshot = useRef(null);
  // Visible save status — surfaced as a small banner in the UI.
  // null = idle, "saving" = in-flight, "error" = failed (banner stays
  // until next successful save). Bumped via setSaveStatus below.
  const [saveStatus, setSaveStatus] = useState(null);
  const saveAttemptRef = useRef(0);
  // FIX (stale-tab stomp): remember last-saved JSON per key so flushSave only
  // writes keys that actually changed in THIS tab. A tab can no longer
  // overwrite domains its user never touched.
  const lastSavedJson = useRef({});

  // FIX (per-domain key split): saveKey writes ONE domain to its own storage
  // key. Combined with the supabase.js app_state_patch RPC, this lets
  // concurrent edits to DIFFERENT domains coexist without clobbering. The
  // helper handles retry + banner per call so the existing UX is preserved.
  const saveKey = async (key, value, attempt = 0) => {
    try {
      await window.storage.set(key, value);
      setSaveStatus(s => (s === "error" ? null : null));
    } catch (e) {
      console.error(`SAVE FAIL [${key}] (attempt ${attempt + 1}):`, e);
      if (attempt < 2) {
        const delay = 500 * Math.pow(3, attempt);
        setTimeout(() => saveKey(key, value, attempt + 1), delay);
      } else if (key === "nirm-prefs") {
        // UI preferences only (which tab was open, etc.) — never worth alarming
        // the user over. Fail quietly; prefs re-save on the next tab switch.
        // The red banner is reserved for keys holding real data.
        console.warn("[save] nirm-prefs save failed after retries — ignored (low-stakes)");
      } else {
        needsSave.current = true;
        setSaveStatus("error");
      }
    }
  };

  // Legacy single-blob save (kept for backward compatibility — wired only by
  // the "Retry now" banner button which forces a full re-flush). Day-to-day
  // saves now go through per-domain useEffects below.
  const doSaveWithRetry = async (payload, attempt = 0) => {
    try {
      await window.storage.set("nirm-all", payload);
      setSaveStatus(s => (s === "error" ? null : null));
    } catch (e) {
      console.error("SAVE FAIL (attempt", attempt + 1, "):", e);
      if (attempt < 2) {
        const delay = 500 * Math.pow(3, attempt);
        setTimeout(() => doSaveWithRetry(payload, attempt + 1), delay);
      } else {
        needsSave.current = true;
        setSaveStatus("error");
      }
    }
  };

  const flushSave = () => {
    if (!window.storage) return;
    const state = stateRef.current;

    if (!storageLoaded) {
      console.warn("[save] Refused: storage not loaded yet");
      return;
    }

    // Shrink-guard (unchanged): refuse to persist a state where critical
    // arrays have shrunk more than 50%. Protects against stale-state writes.
    const snap = lastLoadedSnapshot.current;
    if (snap) {
      const shrinkRefuse = (label, before, after) => {
        if (!Array.isArray(before) || !Array.isArray(after)) return false;
        if (after.length < Math.max(1, Math.floor(before.length * 0.5))) {
          console.warn(`[save] Refused: ${label} shrank from ${before.length} to ${after.length} (would wipe data)`);
          return true;
        }
        return false;
      };
      if (shrinkRefuse("agents", snap.agents, state.agents)) return;
      if (shrinkRefuse("brands", snap.brands, state.brands)) return;
      if (shrinkRefuse("userAccounts", snap.userAccounts, state.userAccounts)) return;
    } else {
      const isEmpty = (a) => !Array.isArray(a) || a.length === 0;
      if (isEmpty(state.agents) && isEmpty(state.brands) && isEmpty(state.userAccounts)) {
        console.warn("[save] Refused: completely empty state (likely failed load)");
        return;
      }
    }

    needsSave.current = false;
    const id = ++saveAttemptRef.current;
    setSaveStatus("saving");
    // FIX (per-domain split): flushSave now writes per-domain keys instead
    // of one giant nirm-all blob. The supabase.js shim batches these into
    // one RPC patch (multiple keys in p_updates), so it's still one network
    // round-trip but each key lives at its own JSONB path on the server.
    // A concurrent editor's per-key save no longer collides with this one.
    // FIX (post-ship review HIGH/H): iterate DOMAIN_KEYS instead of a
    // hardcoded list — drift between this list and the subscriber's list
    // is exactly how bug D slipped in.
    // FIX (stale-tab stomp): only write keys whose value changed in THIS tab.
    const jsonOf = (sk) => JSON.stringify(state[sk] ?? null);
    const dirtyKeys = new Set(DOMAIN_KEYS
      .filter(({ storageKey, stateKey }) => lastSavedJson.current[storageKey] !== jsonOf(stateKey))
      .map(({ storageKey }) => storageKey));
    if (dirtyKeys.size === 0) { setSaveStatus(s => (s === "error" ? "error" : null)); return; }
    Promise.all(
      DOMAIN_KEYS.map(({ storageKey, stateKey }) =>
        dirtyKeys.has(storageKey) ? window.storage.set(storageKey, state[stateKey]).then(() => { lastSavedJson.current[storageKey] = JSON.stringify(state[stateKey] ?? null); }).catch(e => {
          // Preference-only key: a failed prefs write (last-open tab etc.) is
          // not worth the red banner. Swallow it; prefs re-save on next change.
          if (storageKey === "nirm-prefs") { console.warn("[save] nirm-prefs failed - ignored (low-stakes)", e); return; }
          throw e; // real data keys still trip the banner below
        }) : Promise.resolve()
      )
    ).then(() => {
      if (id === saveAttemptRef.current && needsSave.current === false) {
        setSaveStatus(s => (s === "error" ? "error" : null));
      }
    }).catch(e => {
      console.error("Per-domain save failed:", e);
      needsSave.current = true;
      setSaveStatus("error");
    });
  };

  const scheduleSave = () => {
    needsSave.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 300);
  };

  // ── Setters — pure state updates, no side effects ─────────────────────────
  const safeSetAsgn = (updater) => {
    setAllAsgn(prev => {
      const old = prev[currentMK] || {};
      const next = typeof updater === "function" ? updater(old) : updater;
      return {...prev, [currentMK]: next};
    });
  };
  // Apply a shift for a specific date, writing to that date's own month key
  const applyShiftForDate = (agentId, dateStr, shift) => {
    const mk = String(dateStr).slice(0,7);
    setAllAsgn(prev => ({...prev, [mk]: {...(prev[mk]||{}), [`${agentId}_${dateStr}`]: shift}}));
  };
  // Extra hours: set/clear {h, x} for an agent+date (month-keyed like allAsgn)
  const setExtraForDate = (agentId, dateStr, entry) => {
    const mk = String(dateStr).slice(0,7);
    setAllExtraHrs(prev => {
      const cur = {...(prev[mk]||{})};
      const k = `${agentId}_${dateStr}`;
      if (!entry || !entry.h) delete cur[k]; else cur[k] = entry;
      return {...prev, [mk]: cur};
    });
  };
  // Burnout guard for requested shifts (cross-month): no M after E, no E before M
  const violatesRest = (agentId, dateStr, shift) => {
    if (shift !== "M" && shift !== "E") return null;
    const dt = new Date(dateStr + "T00:00:00Z");
    const ymd2 = (x) => x.toISOString().slice(0,10);
    const prevD = new Date(dt); prevD.setUTCDate(dt.getUTCDate()-1);
    const nextD = new Date(dt); nextD.setUTCDate(dt.getUTCDate()+1);
    const shiftOf = (ds) => (allAsgn[ds.slice(0,7)]||{})[`${agentId}_${ds}`];
    if (shift === "M" && shiftOf(ymd2(prevD)) === "E") return "M-after-E";
    if (shift === "E" && shiftOf(ymd2(nextD)) === "M") return "E-before-M";
    return null;
  };
  const safeSetBrandAsgn = (updater) => {
    setAllBrandAsgn(prev => {
      const old = prev[currentMK] || {};
      const next = typeof updater === "function" ? updater(old) : updater;
      return {...prev, [currentMK]: next};
    });
  };
  const safeSetFlags = (updater) => {
    setGlobalFlags(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  };
  const toggleLock = () => {
    setLockedMonths(p => ({...p, [currentMK]: !p[currentMK]}));
  };

  // ── Load on first mount ───────────────────────────────────────────────────
  // FIX (per-domain split): read each domain from its own storage key.
  // Falls back to the legacy nirm-all blob if per-domain keys are empty
  // (first run after upgrading) and writes them back so subsequent loads
  // skip the migration path.
  useEffect(() => {
    (async () => {
      if (!window.storage) { setStorageLoaded(true); return; }
      try {
        // Try per-domain reads first — drive entirely off DOMAIN_KEYS so this
        // list can never drift from flushSave's and the subscriber's lists.
        const fetched = {};
        for (const { storageKey, stateKey } of DOMAIN_KEYS) {
          const r = await window.storage.get(storageKey);
          if (r?.value !== undefined && r?.value !== null) fetched[stateKey] = r.value;
        }

        // Migration fallback: if NO per-domain keys had data, try the legacy
        // nirm-all blob and split it across the new keys.
        // FIX (post-ship review HIGH/C): await the seed writes before
        // marking the load complete. Previously these were fire-and-forget;
        // if the user reloaded inside the 250ms autosave debounce or the
        // tab crashed, only some per-domain keys would exist on next load,
        // hasAnyPerDomain would be true, and the migration path would be
        // skipped — silently losing legacy fields that never made it.
        const hasAnyPerDomain = Object.keys(fetched).length > 0;
        let d = fetched;
        if (!hasAnyPerDomain) {
          const r = await window.storage.get("nirm-all");
          if (r && r.value) {
            const legacy = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
            d = legacy;
            // Write back to per-domain keys so subsequent loads use them.
            const seedPromises = DOMAIN_KEYS
              .filter(({ stateKey }) => legacy[stateKey] !== undefined && legacy[stateKey] !== null)
              .map(({ storageKey, stateKey }) =>
                window.storage.set(storageKey, legacy[stateKey])
                  .catch(e => console.warn("seed", storageKey, e))
              );
            await Promise.all(seedPromises);
          }
        }

        if (d) {
          const LOAD_KEYS = [
            ["agents", setAgents],
            ["brands", setBrands],
            ["budget", setBudget],
            ["monthlyVol", setMonthlyVol],
            ["agentPerf", setAgentPerf],
            ["lockedMonths", setLockedMonths],
            ["allAsgn", setAllAsgn],
            ["allExtraHrs", setAllExtraHrs],
            ["allBrandAsgn", setAllBrandAsgn],
            ["globalFlags", setGlobalFlags],
            ["changeRequests", setChangeRequests],
            ["userProfiles", setUserProfiles],
          ];
          for (const [key, setter] of LOAD_KEYS) {
            if (d[key] != null) setter(d[key]);
          }
          // Keys with special handling stay inline:
          if (d.fulltimeSalary != null) {
            // Legacy migration: single number → per-month object on current month.
            if (typeof d.fulltimeSalary === "number") {
              const legacyMK = d.prefs?.rosterYear && d.prefs?.rosterMonth
                ? `${d.prefs.rosterYear}-${String(d.prefs.rosterMonth).padStart(2,"0")}`
                : `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
              setFulltimeSalary({ [legacyMK]: d.fulltimeSalary });
            } else if (typeof d.fulltimeSalary === "object") {
              setFulltimeSalary(d.fulltimeSalary);
            }
          }
          if (d.role && ROLES[d.role]) { setRole(d.role); setLoggedIn(true); }
          if (d.userAccounts?.length) setUserAccounts(d.userAccounts);

          // FIX (data-loss bug #3 from senior-dev review):
          // Stash a snapshot of what we just loaded so the save-shrink guard
          // can detect when in-memory state regressed (load race, bad merge,
          // etc.) and refuse to clobber storage with a smaller state.
          lastLoadedSnapshot.current = {
            agents: Array.isArray(d.agents) ? d.agents.slice() : [],
            brands: Array.isArray(d.brands) ? d.brands.slice() : [],
            userAccounts: Array.isArray(d.userAccounts) ? d.userAccounts.slice() : [],
          };
          if (d.prefs) {
            if (d.prefs.rosterYear) setRosterYear(d.prefs.rosterYear);
            if (d.prefs.rosterMonth) setRosterMonth(d.prefs.rosterMonth);
            if (d.prefs.allocTab && !TAB_TITLES[initialHash.current]) setAllocTab(d.prefs.allocTab);
            if (d.prefs.volYear) setVolYear(d.prefs.volYear);
            if (d.prefs.volMonth) setVolMonth(d.prefs.volMonth);
            if (d.prefs.loginUser) setLoginUser(d.prefs.loginUser);
          }
          // Override loginUser with the actual signed-in Supabase user's email.
          // This prevents the shared prefs.loginUser from showing the wrong account
          // when multiple users access the same Supabase project.
          try {
            const { data: { user: supabaseUser } } = await supabase.auth.getUser();
            if (supabaseUser?.email) {
              const supaEmail = supabaseUser.email;
              setLoginUser(supaEmail);
              // Auto-bypass the legacy login screen. Supabase is the source of
              // truth: if it says we're signed in, we're signed in. The legacy
              // login can't authenticate Supabase users (their legacy password
              // is the "__supabase__" sentinel, not their real password), so if
              // we don't auto-bypass here, the user is permanently locked out.
              //
              // FIX (comprehensive auth pass): previously this only bypassed if
              // userAccounts already had a matching entry with a valid role —
              // if the entry was missing (lost during per-domain migration,
              // never written, fresh install, etc.) the user got stuck on the
              // legacy login. Now: AUTO-CREATE the entry if missing, so the
              // bypass always succeeds when Supabase has authenticated us.
              const ua = Array.isArray(d.userAccounts) ? d.userAccounts : [];
              const myEntry = ua.find(u => u.username?.toLowerCase() === supaEmail.toLowerCase());
              let effectiveRole = myEntry && ROLES[myEntry.role] ? myEntry.role : null;
              if (!effectiveRole) {
                // No valid entry — try to learn the role from the Supabase
                // profiles table (App.jsx already loaded it via getCurrentRole).
                try {
                  const { data: prof } = await supabase
                    .from("profiles").select("role").eq("id", supabaseUser.id).maybeSingle();
                  if (prof?.role && ROLES[prof.role]) effectiveRole = prof.role;
                } catch (_) { /* non-fatal */ }
              }
              if (!effectiveRole) {
                // Last-resort fallback: first user in an empty list becomes a
                // manager (typical fresh-install path); otherwise default to
                // viewer to be safe.
                effectiveRole = ua.length === 0 ? "manager" : "viewer";
              }
              // Heal the userAccounts list so future loads don't need this fallback.
              setUserAccounts(prev => {
                const list = Array.isArray(prev) ? prev.slice() : [];
                const i = list.findIndex(u => u.username?.toLowerCase() === supaEmail.toLowerCase());
                const entry = { username: supaEmail, password: "__supabase__", role: effectiveRole };
                if (i >= 0) {
                  // Don't downgrade an existing higher role with a fallback default.
                  if (myEntry && ROLES[myEntry.role]) list[i] = { ...list[i], password: "__supabase__" };
                  else list[i] = entry;
                } else {
                  list.push(entry);
                }
                return list;
              });
              setRole(effectiveRole);
              setLoggedIn(true);
            }
          } catch(authErr) { /* non-fatal */ }
        }
      } catch(e) { console.error("Load failed:", e); }
      setStorageLoaded(true);
    })();
  }, []);

  // ── Re-sync React state when storage changes from another client ──────────
  // FIX (architectural): without this, a tab that loaded 15 agents stays at
  // 15 forever in React, even after server gets updated to 13. Any setState
  // here then auto-saves the stale 15-agent blob, clobbering the newer write.
  // We subscribe to stateCache changes (fired by realtime updates from other
  // clients and by round-6 reload-on-reconnect) and re-apply the relevant
  // top-level state setters. The autosave-suspend ref stops the resulting
  // setState cascade from triggering an immediate save echo of the data we
  // just received.
  // FIX (round-7 senior review HIGH): was a single boolean flag with a race —
  // two overlapping foreign updates A then B would have A's 50ms timer fire
  // mid-B and flip the flag false while B was still cascading setState, allowing
  // the auto-save useEffect to fire with stale data. Counter-style depth track
  // means the flag only releases when the last in-flight sync's timer fires.
  const suspendDepth = useRef(0);
  // FIX (round-9 senior review MEDIUM/C): track the last-seen per-domain cache
  // so the subscriber can DIFF and only apply setters for keys that actually
  // changed. Without this, every foreign update (which arrives as a FULL row
  // payload from Realtime) calls every setter — and if a local tab has an
  // unsaved edit batched into React state (within the 300ms debounce window),
  // the subscriber will revert it by re-applying the stale server value.
  const prevDomainCacheRef = useRef({});
  useEffect(() => {
    if (!storageLoaded) return;
    const handler = (newCache) => {
      // FIX (post-ship review CRITICAL/D): after the per-domain split there
      // is no "nirm-all" key anymore — newCache now holds per-domain top-
      // level keys ("nirm-agents", "nirm-brands", …). The previous handler
      // read newCache["nirm-all"] and silently no-op'd on every foreign
      // update, leaving this tab's React state stale. Any subsequent
      // local edit then patched nirm-agents (etc.) with the stale array
      // and clobbered the foreign client's writes on the same key — the
      // exact data-loss bug the architectural fix was supposed to prevent.
      //
      // Now: iterate DOMAIN_KEYS, pull the per-key value from newCache,
      // and apply the matching React setter. Build the setter map from
      // local closures since useState setters are component-scoped.
      const setterMap = {
        agents:         setAgents,
        brands:         setBrands,
        budget:         setBudget,
        monthlyVol:     setMonthlyVol,
        agentPerf:      setAgentPerf,
        lockedMonths:   setLockedMonths,
        allAsgn:        setAllAsgn,
        allExtraHrs:    setAllExtraHrs,
        allBrandAsgn:   setAllBrandAsgn,
        globalFlags:    setGlobalFlags,
        changeRequests: setChangeRequests,
        userProfiles:   setUserProfiles,
        userAccounts:   setUserAccounts,
        fulltimeSalary: setFulltimeSalary,
        // Intentionally NOT synced from foreign tabs (parity with old
        // behaviour): role and prefs are session-scoped — another tab's
        // logged-in user/UI state shouldn't override ours. fulltimeSalary
        // is also excluded to match the pre-split subscriber.
      };
      // Build the merged "d" from per-domain keys in newCache so the rest
      // of this handler (snapshot refresh, shrink guard) keeps working.
      const d = {};
      let anyDomainPresent = false;
      for (const { storageKey, stateKey } of DOMAIN_KEYS) {
        if (newCache && Object.prototype.hasOwnProperty.call(newCache, storageKey)) {
          d[stateKey] = newCache[storageKey];
          anyDomainPresent = true;
        }
      }
      if (!anyDomainPresent) return; // nothing to sync
      // FIX (round-9 senior review MEDIUM/C): only apply setters for keys
      // whose CACHED value actually changed. The realtime payload always
      // contains the full row, so the naive "loop every domain and call its
      // setter" approach would clobber unsaved local edits batched in React
      // state for keys the foreign tab didn't touch. Use referential equality
      // first (cheap), then JSON-stringify fallback for value equality on
      // arrays/objects whose top-level reference may have changed without
      // any actual content change. If reference and stringify both differ,
      // the key was genuinely modified by someone else — apply the setter.
      const changedStateKeys = new Set();
      for (const { storageKey, stateKey } of DOMAIN_KEYS) {
        if (!(storageKey in (newCache || {}))) continue;
        const next = newCache[storageKey];
        const prev = prevDomainCacheRef.current[storageKey];
        if (next === prev) continue; // referentially identical
        let changed = true;
        try {
          if (JSON.stringify(next) === JSON.stringify(prev)) changed = false;
        } catch (_) { /* very large or circular — assume changed */ }
        if (changed) changedStateKeys.add(stateKey);
      }
      // Snapshot the new cache for next time even if nothing changed (handles
      // the first call after mount where prevDomainCacheRef is empty).
      const nextSnapshot = { ...prevDomainCacheRef.current };
      for (const { storageKey } of DOMAIN_KEYS) {
        if (storageKey in (newCache || {})) nextSnapshot[storageKey] = newCache[storageKey];
      }
      prevDomainCacheRef.current = nextSnapshot;
      if (changedStateKeys.size === 0) return; // server matches our last-seen state — no setters needed
      try {
        suspendDepth.current++;
        for (const { stateKey } of DOMAIN_KEYS) {
          if (!changedStateKeys.has(stateKey)) continue;
          const setter = setterMap[stateKey];
          if (!setter) continue; // session-scoped key, skip
          if (d[stateKey] != null) setter(d[stateKey]);
        }
        // FIX (round-7 senior review): only refresh the load snapshot when the
        // incoming payload is at least as large as the prior snapshot. Otherwise
        // a stale/malicious payload with shrunken arrays would silently widen
        // what the shrink-guard accepts on subsequent local saves.
        const prev = lastLoadedSnapshot.current || {};
        const safeLen = (a, fallback) =>
          Array.isArray(a) && a.length >= (Array.isArray(fallback) ? fallback.length : 0);
        if (
          safeLen(d.agents, prev.agents) &&
          safeLen(d.brands, prev.brands) &&
          safeLen(d.userAccounts, prev.userAccounts)
        ) {
          lastLoadedSnapshot.current = {
            agents: Array.isArray(d.agents) ? d.agents.slice() : [],
            brands: Array.isArray(d.brands) ? d.brands.slice() : [],
            userAccounts: Array.isArray(d.userAccounts) ? d.userAccounts.slice() : [],
          };
        }
        // Release one level of suspension after React has had a chance to flush
        // the cascaded setState calls and re-run the auto-save useEffect (which
        // is gated on suspendDepth === 0 — see below).
        // FIX (round-8 senior review HIGH/E): if a local edit batched its
        // setState into the same render as this foreign cascade, the auto-save
        // useEffect already ran once with suspendDepth > 0 and skipped
        // scheduleSave. Without a follow-up, that local edit is lost on tab
        // close in the next 100ms. After decrementing back to 0, fire one
        // catch-up save if anything is marked dirty.
        setTimeout(() => {
          if (suspendDepth.current > 0) suspendDepth.current--;
          if (suspendDepth.current === 0 && needsSave.current) scheduleSave();
        }, 100);
      } catch (e) {
        console.error("Re-sync from realtime failed:", e);
      }
    };
    const unsub = onStateChange(handler);
    return () => { unsub && unsub(); };
  }, [storageLoaded]);

  // ── Auto-save AFTER every render that changes data ─────────────────────────
  // This useEffect runs AFTER render, so stateRef.current is guaranteed up-to-date.
  // FIX (round-7): gate on suspendDepth counter (not a boolean) so overlapping
  // foreign updates don't race-condition the suspension flag.
  // FIX (round-8 senior review HIGH/E): when suspended, do NOT start the timer
  // (that would race the foreign-update setters that are still cascading), but
  // DO mark needsSave so the subscriber's post-decrement catch-up will pick up
  // any local edit that batched into this render. Without this, a local edit
  // that lands in the same React batch as a foreign realtime update is silently
  // dropped if the tab closes within 100ms.
  useEffect(() => {
    if (!storageLoaded) return;
    if (suspendDepth.current === 0) {
      scheduleSave();
    } else {
      needsSave.current = true;
    }
  }, [agents, brands, budget, fulltimeSalary, monthlyVol, agentPerf, lockedMonths, role, changeRequests, userProfiles, userAccounts, rosterYear, rosterMonth, allocTab, volYear, volMonth, allAsgn, allExtraHrs, allBrandAsgn, globalFlags, storageLoaded]);

  // Flush save on unmount
  useEffect(() => {
    return () => { if (needsSave.current) flushSave(); };
  }, []);

  // Detect invite link (?invite=agentId) and open the payroll form
  useEffect(() => {
    if (!storageLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const invId = params.get("invite");
    const invName = params.get("name");
    if (invId) {
      setInviteFormAgentId(invId);
      setInviteFormData(d => ({...d, fullName: invName ? decodeURIComponent(invName) : ""}));
      setInviteFormModal(true);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [storageLoaded]);

  // If current tab not allowed for this role, bounce to roster
  useEffect(() => {
    if (loggedIn && role && !allowedTabs.includes(allocTab)) {
      setAllocTab("roster");
    }
  }, [role, allocTab, loggedIn]);

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Close cell popup when clicking outside
  useEffect(() => {
    if (!cellKey) return;
    const handler = () => setCellKey(null);
    const timer = setTimeout(() => document.addEventListener("click", handler), 10);
    return () => { clearTimeout(timer); document.removeEventListener("click", handler); };
  }, [cellKey]);

  const dates = useMemo(() => {
    return allocMkDates(rosterYear, rosterMonth);
  }, [rosterYear, rosterMonth]);

  const active = agents.filter(a => a.active);
  const CW = 58;

  const rosterAgents = active.filter(a =>
    a.team !== "T2" &&
    (rosterTeam==="all" || a.team===rosterTeam) &&
    (rosterSearch==="" || a.name.toLowerCase().includes(rosterSearch.toLowerCase()))
  ).sort((a,b)=>(a.id||"").localeCompare(b.id||"",undefined,{numeric:true}));

  const hdBg = d => {
    const fl=flags[d.date];
    if(fl?.type==="holiday") return "#FEF3C7";
    if(fl?.type==="campaign") return "#F0FDFA";
    if(d.isWE) return "#FFF5F5";
    return "#FFFFFF";
  };
  const cBg = d => {
    const fl=flags[d.date];
    if(fl?.type==="holiday") return "#FFFBEB";
    if(fl?.type==="campaign") return "#F0FDFA";
    if(d.isWE) return "#FFF9F9";
    return "#FAFBFC";
  };

  const daySummary = dates.map(d => {
    let m=0,me=0,e=0,other=0;
    active.filter(a => a.team !== "T2").forEach(ag => {
      const v=asgn[`${ag.id}_${d.date}`];
      if(!v || v==="Off") return;
      if(v==="M") m++;
      else if(v==="ME") me++;
      else if(v==="E") e++;
      else other++; // OT, TOIL, etc.
    });
    return {m, me, e, total: m+me+e+other};
  });
  const t2Agents       = agents.filter(a => a.active && a.team==="T2");
  // T2 salary for the currently selected roster month (looked up by mkKey)
  const t2MonthlyCost  = (fulltimeSalary && fulltimeSalary[currentMK]) || 0;
  const t2DailyShare   = dates.length > 0 ? t2MonthlyCost / dates.length : 0;

  const dayCosts = dates.map(d => {
    // T1 + Return: cost per worked day
    let c = 0;
    active.filter(a => a.team !== "T2").forEach(ag => {
      const v=asgn[`${ag.id}_${d.date}`];
      if(v&&v!=="Off"&&v!=="TOIL") c+=ag.costDay*(v==="OT"?1.5:1);
    });
    // T2: spread monthly salary evenly across all days in period
    c += t2DailyShare;
    return Math.round(c);
  });
  const totalCost = active.filter(a=>a.team!=="T2").reduce((s,a)=>{
    let c=0; dates.forEach(dt=>{const v=asgn[`${a.id}_${dt.date}`];if(v&&v!=="Off"&&v!=="TOIL")c+=a.costDay*(v==="OT"?1.5:1);});
    return s+c;
  },0) + t2MonthlyCost;
  const t1ReturnAgents = agents.filter(a => a.active && (a.team==="T1"||a.team==="Return"));
  const t1ReturnCost   = t1ReturnAgents.reduce((s,a) => {
    let c=0; dates.forEach(d=>{const v=asgn[`${a.id}_${d.date}`];if(v&&v!=="Off"&&v!=="TOIL")c+=a.costDay*(v==="OT"?1.5:1);}); return s+c;
  }, 0);
  const totalBudget = Object.values(budget).reduce((s,v)=>s+v,0);

  // FIX: stash _originalId so saveAgent can detect an id rename and rewrite
  // references (allAsgn, allBrandAsgn) that key off the agent id.
  const openAgent = ag => { setEditAgent({...ag, days:[...ag.days], _originalId: ag.id}); setInviteEmail(""); setInviteSent(false); setInviteSending(false); setAgentModal(true); };
  const saveAgent = () => {
    const candidateId = (editAgent.id || "").trim();
    if (!candidateId) {
      alert("PCode is required.");
      return;
    }
    const originalId = editAgent._originalId || candidateId;
    const isRename = !editAgent._isNew && originalId !== candidateId;

    // Collision check before mutating
    if (isRename || editAgent._isNew) {
      const collides = agents.some(a => a.id === candidateId && a.id !== originalId);
      if (collides && !editAgent._isNew) {
        alert(`PCode ${candidateId} is already used by another agent. Pick a different code.`);
        return;
      }
    }

    setAgents(p => {
      let candidate = { ...editAgent };
      delete candidate._originalId;
      if (candidate._isNew) {
        let id = candidateId;
        while (p.some(a => a.id === id)) {
          const num = parseInt(String(id).replace(/^A/,""),10);
          id = `A${String((isNaN(num)?p.length:num)+1).padStart(2,"0")}`;
        }
        candidate = { ...candidate, id };
        delete candidate._isNew;
        return [...p, candidate];
      }
      const i = p.findIndex(a => a.id === originalId);
      if (i >= 0) { const n = [...p]; n[i] = { ...candidate, id: candidateId }; return n; }
      return [...p, { ...candidate, id: candidateId }];
    });

    // FIX: if the user renamed the PCode, migrate all references in the
    // shift-allocation maps (allAsgn) and brand-allocation maps
    // (allBrandAsgn). Keys in allAsgn look like `${agentId}_${date}` and
    // brand-allocation values include the agent id alongside the name.
    if (isRename) {
      setAllAsgn(prev => {
        const next = {};
        for (const [mk, m] of Object.entries(prev || {})) {
          const updated = {};
          for (const [k, v] of Object.entries(m || {})) {
            // Keys are `${agentId}_${date}`
            if (k.startsWith(originalId + "_")) {
              updated[candidateId + k.slice(originalId.length)] = v;
            } else {
              updated[k] = v;
            }
          }
          next[mk] = updated;
        }
        return next;
      });
      setAllBrandAsgn(prev => {
        const next = {};
        for (const [mk, m] of Object.entries(prev || {})) {
          const updated = {};
          for (const [k, v] of Object.entries(m || {})) {
            // Values can be a string (agent id) or array of agent ids/names.
            if (Array.isArray(v)) {
              updated[k] = v.map(x => x === originalId ? candidateId : x);
            } else if (v === originalId) {
              updated[k] = candidateId;
            } else {
              updated[k] = v;
            }
          }
          next[mk] = updated;
        }
        return next;
      });
    }
    setAgentModal(false);
  };

  // ── EmailJS configuration — replace with your own keys ────────────────────
  // Setup guide: https://www.emailjs.com/docs/tutorial/overview/
  // 1. Sign up free at emailjs.com
  // 2. Add a service (Gmail / Outlook / etc)
  // 3. Create a template — use variables: {{to_email}}, {{agent_name}}, {{form_link}}, {{from_name}}
  // 4. Paste your keys below
  const EMAILJS_SERVICE_ID  = "NiRM";
  const EMAILJS_TEMPLATE_ID = "template_9zz3oeg";
  const EMAILJS_PUBLIC_KEY  = "2qnq2ya-IZ0mYPM-U";

  const getInviteLink = (ag) => {
    // FIX (audit #7): match the detector below — same path, param name `invite`
    return `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(ag.id)}&name=${encodeURIComponent(ag.name)}`;
  };

  const sendInvite = async () => {
    if (!inviteEmail || !editAgent) return;
    setInviteSending(true);
    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          service_id:  EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id:     EMAILJS_PUBLIC_KEY,
          template_params: {
            to_email:   inviteEmail,
            agent_name: editAgent.name || "Team Member",
            from_name:  loginUser || "Your Manager",
            team:       editAgent.team,
            form_link:  getInviteLink(editAgent),
          },
        }),
      });
      setInviteSent(res.ok ? "sent" : "error");
    } catch {
      setInviteSent("error");
    }
    setInviteSending(false);
  };

  // Save payroll info submitted by agent
  const savePayrollInfo = () => {
    if (!inviteFormAgentId) return;
    setAgents(p => p.map(a => a.id === inviteFormAgentId
      ? { ...a,
          fullName:        inviteFormData.fullName || a.name,
          thaiName:        inviteFormData.thaiName,
          phone:           inviteFormData.phone,
          idCard:          inviteFormData.idCard,
          taxId:           inviteFormData.taxId,
          idCardAddress:   inviteFormData.idCardAddress,
          docDeliveryAddress: inviteFormData.sameAddress ? inviteFormData.idCardAddress : inviteFormData.docDeliveryAddress,
          bankName:        inviteFormData.bankName,
          bankAccount:     inviteFormData.bankAccount,
          bankAccountName: inviteFormData.bankAccountName,
          startDate:       inviteFormData.startDate,
          costDay:         Number(inviteFormData.costDay) || a.costDay,
          profilePhotoUrl: inviteFormData.profilePhotoUrl,
          idCardPhotoUrl:  inviteFormData.idCardPhotoUrl,
          bookbankPhotoUrl: inviteFormData.bookbankPhotoUrl,
          payrollInfoUpdatedAt: new Date().toISOString(),
        }
      : a
    ));
    setInviteFormModal(false);
    setInviteFormData({fullName:"",thaiName:"",phone:"",idCard:"",taxId:"",idCardAddress:"",docDeliveryAddress:"",sameAddress:true,bankName:"",bankAccount:"",bankAccountName:"",startDate:"",costDay:"",profilePhotoUrl:"",idCardPhotoUrl:"",bookbankPhotoUrl:""});
    setInviteFormAgentId(null);
  };

  const openBrand = b => { setEditBrand({...b, platforms:[...(b.platforms||[])]}); setBrandModal(true); };
  const saveBrand = () => {
    setBrands(p => {
      const i=p.findIndex(b=>b.id===editBrand.id);
      if(i>=0){const n=[...p];n[i]=editBrand;return n;}
      return [...p,editBrand];
    });
    setBrandModal(false);
  };
  const deleteBrand = (id) => {
    setBrands(p=>p.filter(b=>b.id!==id));
    setBrandModal(false);
  };

  // ── Pure-JS download helper ─────────────────────────────────────────────────
  const dlBlob = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
  };

  // ── Export to real .xlsx (pure JS, no library) ─────────────────────────────
  const dlXLSX = (rows, filename) => {
    const esc = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    // FIX (audit #6): proper base-26 column reference (AA, AB, …, AZ, BA, …)
    const colRef = (n) => {
      let s = "", x = n + 1;
      while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
      return s;
    };
    let sheetData = "";
    rows.forEach((row, ri) => {
      sheetData += "<row r=\""+(ri+1)+"\">";
      row.forEach((cell, ci) => {
        const ref = colRef(ci) + (ri+1);
        const v = cell == null ? "" : cell;
        if (typeof v === "number" && !isNaN(v)) {
          sheetData += "<c r=\""+ref+"\"><v>"+v+"</v></c>";
        } else {
          sheetData += "<c r=\""+ref+"\" t=\"inlineStr\"><is><t>"+esc(v)+"</t></is></c>";
        }
      });
      sheetData += "</row>";
    });
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheetData+'</sheetData></worksheet>';
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>';
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="sheet1.xml"/></Relationships>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="workbook.xml"/></Relationships>';
    const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
    // Build ZIP manually (store method, no compression)
    const te = new TextEncoder();
    const files = [
      {name:"[Content_Types].xml", data:te.encode(ct)},
      {name:"_rels/.rels", data:te.encode(rootRels)},
      {name:"workbook.xml", data:te.encode(workbook)},
      {name:"_rels/workbook.xml.rels", data:te.encode(rels)},
      {name:"sheet1.xml", data:te.encode(sheet)},
    ];
    const z = [];
    const entries = [];
    let offset = 0;
    files.forEach(f => {
      const nameBytes = te.encode(f.name);
      // Local file header
      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
      lv.setUint16(8, 0, true); lv.setUint32(14, 0, true);
      lv.setUint32(18, f.data.length, true); lv.setUint32(22, f.data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lh.set(nameBytes, 30);
      entries.push({offset, nameBytes, data:f.data});
      z.push(lh, f.data);
      offset += lh.length + f.data.length;
    });
    const cdStart = offset;
    entries.forEach(e => {
      const cd = new Uint8Array(46 + e.nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true);
      cv.setUint16(28, e.nameBytes.length, true);
      cv.setUint32(42, e.offset, true);
      cd.set(e.nameBytes, 46);
      z.push(cd);
      offset += cd.length;
    });
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, offset - cdStart, true); ev.setUint32(16, cdStart, true);
    z.push(eocd);
    const blob = new Blob(z, {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=filename.replace(/\.csv$/,".xlsx");
    document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},300);
  };

  // Export as printable HTML (PDF via browser print dialog) ───────────────────
  const printHTML = (htmlContent, title) => {
    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) { alert("Please allow pop-ups to export PDF"); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:10px;color:#111;background:#fff;padding:12px}
      h1{font-size:15px;margin-bottom:8px;color:#F1F5F9}
      h2{font-size:12px;margin:12px 0 6px;color:#444}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;page-break-inside:auto}
      th{background:#0D9488;color:#fff;padding:5px 7px;text-align:center;font-size:9px;border:1px solid #E2E8F0}
      td{padding:4px 6px;text-align:center;border:1px solid #ddd;font-size:9px}
      tr:nth-child(even) td{background:#f5f5f5}
      .M{background:#dbeafe;color:#1d4ed8;font-weight:700}
      .ME{background:#ede9fe;color:#14b8a6;font-weight:700}
      .E{background:#d1fae5;color:#065f46;font-weight:700}
      .Off{background:#fee2e2;color:#991b1b}
      .TOIL{background:#fef3c7;color:#92400e}
      .OT{background:#fce7f3;color:#9d174d;font-weight:700}
      .name-col{text-align:left;font-weight:600;min-width:80px}
      .team-col{font-size:8px;font-weight:700}
      @media print{body{padding:4px}@page{size:A3 landscape;margin:8mm}}
    </style></head><body>${htmlContent}
    <script>window.onload=()=>{window.print();}<\/script></body></html>`);
    win.document.close();
  };

  // ── Export Roster to Excel (CSV) ───────────────────────────────────────────
  const exportRosterXLSX = () => {
    const header = ["Team","Agent", ...dates.map(d=>`${d.dd}/${d.mm} ${d.day}`)];
    const rows = [header, ...rosterAgents.map(ag => [
      ag.team, ag.name,
      ...dates.map(d => asgn[`${ag.id}_${d.date}`] || "")
    ])];
    rows.push(["","Working", ...dates.map(d =>
      rosterAgents.filter(ag => { const v=asgn[`${ag.id}_${d.date}`]; return v&&v!=="Off"&&v!=="TOIL"; }).length
    )]);
    dlXLSX(rows, `Roster_${MONTHS[rosterMonth-1]}${rosterYear}.xlsx`);
  };

  // ── Export Roster to PDF (print) ───────────────────────────────────────────
  const exportRosterPDF = () => {
    const label = `${MONTHS[rosterMonth-1]} ${rosterYear}`;
    const shiftClass = {M:"M",ME:"ME",E:"E",Off:"Off",TOIL:"TOIL",OT:"OT"};
    let html = `<h1>Roster — ${label}</h1><table>`;
    html += `<thead><tr><th>Team</th><th>Agent</th>${dates.map(d=>`<th>${d.dd}/${d.mm}<br/>${d.day}</th>`).join('')}</tr></thead>`;
    html += `<tbody>`;
    rosterAgents.forEach(ag => {
      html += `<tr><td class="team-col">${ag.team}</td><td class="name-col">${ag.name}</td>`;
      dates.forEach(d => {
        const v = asgn[`${ag.id}_${d.date}`] || "";
        html += `<td class="${shiftClass[v]||''}">${v||""}</td>`;
      });
      html += `</tr>`;
    });
    // Summary row
    html += `<tr style="border-top:2px solid #F1F5F9"><td></td><td class="name-col" style="font-weight:700">Working</td>`;
    dates.forEach(d => {
      const n = rosterAgents.filter(ag => { const v=asgn[`${ag.id}_${d.date}`]; return v&&v!=="Off"&&v!=="TOIL"; }).length;
      html += `<td style="font-weight:700;background:#e0e7ff">${n}</td>`;
    });
    html += `</tr></tbody></table>`;
    printHTML(html, `Roster ${label}`);
  };

  // ── Export Allocation to Excel (CSV) ──────────────────────────────────────
  const exportAllocXLSX = () => {
    const allRows = [["Shift","Brand","Group","Platform","Chats/mo","Assigned Agent(s)","Date"]];
    ["M","E"].forEach(shift => {
      const shiftLabel = shift==="M" ? "Morning" : "Evening";
      dates.forEach(d => {
        brands.forEach(b => {
          (b.platforms||[]).forEach(plat => {
            const k = `${b.id}_${d.date}_${shift}_${plat}`;
            const raw = brandAsgn[k];
            const names = [...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
            allRows.push([shiftLabel, b.name, b.wh||"", plat, b.chats?.[plat]||0, names.join(", ")||"Unassigned", `${d.dd}/${d.mm}`]);
          });
        });
      });
    });
    dlXLSX(allRows, `Allocation_${MONTHS[rosterMonth-1]}${rosterYear}.xlsx`);
  };

  // ── Export Allocation to PDF (print) ─────────────────────────────────────
  const exportAllocPDF = () => {
    const selDate = dates[Math.min(allocDateIdx, dates.length-1)] || dates[0];
    if (!selDate) return;
    const dateLabel = `${selDate.dd}/${selDate.mm} ${selDate.day}`;
    let html = `<h1>Allocation — ${dateLabel}</h1>`;
    ["M","E"].forEach(shift => {
      const shiftLabel = shift==="M" ? "AM" : "PM";
      html += `<h2>${shiftLabel} Shift</h2><table>`;
      html += `<thead><tr><th>#</th><th style="text-align:left;min-width:140px">Brand</th><th>Group</th><th>Platform</th><th>Chats/mo</th><th style="text-align:left;min-width:120px">Assigned Agent(s)</th><th>Status</th></tr></thead><tbody>`;
      let n = 0;
      brands.forEach(b => {
        (b.platforms||[]).forEach(plat => {
          const k = `${b.id}_${selDate.date}_${shift}_${plat}`;
          const raw = brandAsgn[k];
          const names = [...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
          n++;
          const pc = PLATFORM_C[plat];
          html += `<tr>
            <td>${n}</td>
            <td style="text-align:left;font-weight:600">${b.name}</td>
            <td>${b.wh||"—"}</td>
            <td style="font-weight:700">${plat}</td>
            <td style="text-align:right">${(b.chats?.[plat]||0).toLocaleString()}</td>
            <td style="text-align:left">${names.join(", ")||"—"}</td>
            <td style="color:${names.length>0?"#065f46":"#991b1b"};font-weight:700">${names.length>0?"✓ Assigned":"Pending"}</td>
          </tr>`;
        });
      });
      html += `</tbody></table>`;
    });
    printHTML(html, `Allocation ${dateLabel}`);
  };

  // Get chat volume for a brand/platform, using monthly override if available, else brand default
  const volKey = (y, m) => `${y}-${String(m).padStart(2,"0")}`;
  const getVol = (brandId, platform, y=volYear, m=volMonth) => {
    const mk = volKey(y, m);
    const fromVol = monthlyVol[mk]?.[brandId]?.[platform];
    if (fromVol !== undefined) return fromVol;
    // FIX: previously fell back to brands.chats (the global default) when the
    // current month had no monthlyVol entry. Because the duoke import updates
    // brands.chats as a side-effect, every unimported month inherited the
    // last-imported month's values — making all months look identical.
    // Now: each month must have its own monthlyVol entry. Use "Copy from
    // previous month" or re-import to seed a new month explicitly.
    return 0;
  };
  const setVol = (brandId, platform, value, y=volYear, m=volMonth) => {
    const mk = volKey(y, m);
    setMonthlyVol(prev => ({
      ...prev,
      [mk]: {
        ...(prev[mk]||{}),
        [brandId]: {
          ...(prev[mk]?.[brandId]||{}),
          [platform]: Number(value)||0
        }
      }
    }));
    // Also update the brand's chats directly so allocation uses latest values
    setBrands(p => p.map(b => b.id===brandId ? {...b, chats:{...(b.chats||{}), [platform]: Number(value)||0}} : b));
  };

  // Allocation: working T1 + CC agents on a date+shift (CC manual-assign only; autoAllocateBrands stays T1-only)
  const getWorkingAgents = (date, shift) => {
    return agents.filter(a => {
      if(!a.active || (a.team!=="T1" && a.team!=="CC")) return false;
      const v = asgn[`${a.id}_${date}`];
      if(!v || v==="Off" || v==="TOIL") return false;
      if(shift==="ME") return v==="ME"; // ME view: only ME-rostered agents
      if(v==="ME") return true; // ME agents appear in both M and E views
      return v===shift;
    });
  };

  const inpS = {
    padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0",
    background:"#fff", color:"#1A1D2E", fontSize:13, fontFamily:"inherit", outline:"none",
    transition:"border 0.15s",
  };

  const dateLabel = `${MONTHS[rosterMonth-1]} ${rosterYear}`;

  // Sidebar collapsed state
  const SW = sidebarOpen ? 220 : 64;

  // ── Personal view data (for T1/viewer agents) ─────────────────────────────
  // Match by email first (preferred), fall back to name
  // T1 and viewer see only their own row. Fulltime, RT&RF, and Manager see the full roster.
  const myAgent = (role==="t1" || role==="viewer") ? agents.find(a => {
    const lu = (loginUser||"").toLowerCase().trim();
    if (!lu) return false;
    if (a.email && a.email.toLowerCase().trim() === lu) return true;
    if (a.name && a.name.toLowerCase().trim() === lu) return true;
    return false;
  }) : null;
  // Separate lookup for payroll: T1 and RT&RF both see their own monthly invoice,
  // regardless of whether the full roster view applies.
  const myPayrollAgent = (role==="t1" || role==="return")
    ? agents.find(a => {
        const lu = (loginUser||"").toLowerCase().trim();
        if (!lu) return false;
        if (a.email && a.email.toLowerCase().trim() === lu) return true;
        if (a.name && a.name.toLowerCase().trim() === lu) return true;
        return false;
      })
    : null;
  // Time labels per shift code. The agent's actual roster shift on a date determines the label.
  const SHIFT_LABEL = { M: "Morning (07:00 - 16:00)", ME: "ME (12:00 - 21:00)", E: "Evening (16:00 - 01:00)" };
  // Brands assigned to ANY agent on a given date (same matching as myBrandsForDate)
  const brandsForAgentOn = (ag, dateStr) => {
    const out = []; const seen = new Set();
    if (!ag || !dateStr) return out;
    brands.forEach(b => {
      if (b.offboarded) return;
      (b.platforms||[]).forEach(plat => {
        ["M","ME","E"].forEach(shift => {
          const raw = brandAsgn[`${b.id}_${dateStr}_${shift}_${plat}`];
          const assigned = Array.isArray(raw) ? raw : (raw ? [raw] : []);
          if (assigned.includes(ag.name)) {
            const dk = `${b.id}|${plat}`;
            if (!seen.has(dk)) { seen.add(dk); out.push({brand:b.name, plat, wh:b.wh||""}); }
          }
        });
      });
    });
    return out;
  };
  const myBrands = [];
  const myBrandsForDate = []; // brand assignments for the selectedRosterDate only
  if (myAgent) {
    const seen = new Set();
    const seenForDate = new Set(); // per-date dedup so a brand+platform appears once even if in multiple shift slots
    dates.forEach(dt => {
      // Agent's actual shift for this date. Used to override the brand slot's label
      // so an ME-shift agent sees every brand as 'ME (12:00 - 21:00)' regardless of which slot it sits in.
      const agentShiftOnDt = asgn[`${myAgent.id}_${dt.date}`] || null;
      // If agent isn't working that day (Off / TOIL / OT / no shift), skip brand assignments
      const isWorkingShift = agentShiftOnDt === "M" || agentShiftOnDt === "ME" || agentShiftOnDt === "E";
      if (!isWorkingShift) return;
      brands.forEach(b => {
        if (b.offboarded) return; // offboarded brands never show in personal assignments
        (b.platforms||[]).forEach(plat => {
          ["M","ME","E"].forEach(shift => {
            const k = `${b.id}_${dt.date}_${shift}_${plat}`;
            const raw = brandAsgn[k];
            const assigned = Array.isArray(raw) ? raw : (raw ? [raw] : []);
            if (assigned.includes(myAgent.name)) {
              const key = `${b.id}|${plat}|${shift}`;
              const displayShift = SHIFT_LABEL[agentShiftOnDt] || SHIFT_LABEL[shift] || shift;
              const displayCode = (agentShiftOnDt && SHIFT_LABEL[agentShiftOnDt]) ? agentShiftOnDt : shift;
              if (!seen.has(key)) {
                seen.add(key);
                myBrands.push({brand:b.name, plat, shift:displayShift, shiftCode:displayCode, wh:b.wh||""});
              }
              if (selectedRosterDate && dt.date === selectedRosterDate) {
                // Dedup by brand+platform+displayCode so M+E slot duplicates collapse into one ME row
                const dateKey = `${b.id}|${plat}|${displayCode}`;
                if (!seenForDate.has(dateKey)) {
                  seenForDate.add(dateKey);
                  myBrandsForDate.push({brand:b.name, plat, shift:displayShift, shiftCode:displayCode, wh:b.wh||""});
                }
              }
            }
          });
        });
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SINGLE RETURN
  // ══════════════════════════════════════════════════════════════════════════
  if (!loggedIn) {
    return (
      <div style={{minHeight:"100vh",background:"#FAFBFC",display:"flex",fontFamily:"'DM Sans',sans-serif"}}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
          .login-card{animation:fadeUp 0.4s ease}
          .signin-btn:hover{opacity:0.9;transform:translateY(-1px);box-shadow:0 6px 20px #14B8A644}
          .signin-btn{transition:all 0.2s}
        `}</style>

        {!storageLoaded ? (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{width:40,height:40,border:"3px solid #E2E8F0",borderTop:"3px solid #14B8A6",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
              <div style={{color:"#94A3B8",fontSize:13}}>Loading…</div>
            </div>
          </div>
        ) : (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:32}}>
              <div className="login-card" style={{width:"100%",maxWidth:380}}>
                <div style={{textAlign:"center",marginBottom:32}}>
                  <NirmLogo size={48}/>
                  <div style={{fontSize:22,fontWeight:700,color:"#0F172A",marginTop:16}}>NiRM</div>
                  <div style={{fontSize:13,color:"#94A3B8",marginTop:4}}>Sign in to your workspace</div>
                </div>

                {/* Name */}
                <div style={{marginBottom:16}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Email</label>
                  <input value={loginUser} onChange={e=>setLoginUser(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                    placeholder="someone@crea.asia"
                    autoFocus
                    style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1.5px solid #E2E8F0",background:"#fff",color:"#1A1D2E",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border 0.15s"}}
                    onFocus={e=>e.target.style.borderColor="#0D9488"}
                    onBlur={e=>e.target.style.borderColor="#E2E8F0"}
                  />
                </div>

                {/* Password */}
                <div style={{marginBottom:24}}>
                  <label style={{fontSize:11,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:6}}>Password</label>
                  <input type="password" value={loginPass}
                    onChange={e=>{setLoginPass(e.target.value);setLoginError("");}}
                    onKeyDown={e=>e.key==="Enter"&&handleLogin()}
                    placeholder="Enter your password"
                    style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1.5px solid ${loginError?"#FCA5A5":"#E2E8F0"}`,background:"#fff",color:"#1A1D2E",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border 0.15s"}}
                    onFocus={e=>{ if(!loginError) e.target.style.borderColor="#0D9488"; }}
                    onBlur={e=>{ if(!loginError) e.target.style.borderColor="#E2E8F0"; }}
                  />
                  {loginError && (
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:7}}>
                      <span style={{fontSize:12,color:"#EF4444",fontWeight:600}}>{loginError}</span>
                    </div>
                  )}
                </div>

                <button className="signin-btn" onClick={handleLogin}
                  style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:"#0D9488",color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  Sign in
                </button>
              </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{background:"#F8FAFC",minHeight:"100vh",color:"#1A1D2E",fontFamily:"'DM Sans',sans-serif",display:"flex"}}>
      {/* Loading overlay */}
      {!storageLoaded && (
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"#F8FAFC",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{textAlign:"center"}}>
            <div style={{width:36,height:36,border:"3px solid #E2E8F0",borderTop:"3px solid #14B8A6",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
            <div style={{color:"#64748B",fontSize:12,fontWeight:500}}>Loading…</div>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* ═══ SIDEBAR ═══ */}
      <div style={{width:SW,minHeight:"100vh",background:"#fff",borderRight:"1px solid #E2E8F0",display:"flex",flexDirection:"column",transition:"width 0.2s ease",flexShrink:0,position:"sticky",top:0,height:"100vh",overflow:"hidden",zIndex:50}}>
        {/* Logo */}
        <div style={{padding:sidebarOpen?"20px 20px 16px":"20px 12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #F1F5F9"}}>
          <NirmLogo size={sidebarOpen?30:36}/>
          {sidebarOpen && <span style={{fontSize:16,fontWeight:700,letterSpacing:-0.3,color:"#0F172A"}}>NiRM</span>}
        </div>

        {/* Nav items */}
        <div style={{flex:1,padding:"12px 8px",display:"flex",flexDirection:"column",gap:2}}>
          {[["roster","Roster"],["payment","My Invoice"],["allocation","Allocation"],["dates","Dates"],["volume","Performance"],["agents","Teams"],["budget","Report"],["analytics","CS Analytics"]].map(([t,l])=>{
            if(!allowedTabs.includes(t)) return null;
            const active2 = allocTab===t;
            const iconColor = active2?"#0D9488":"#94A3B8";
            return (
              <button key={t} onClick={()=>setAllocTab(t)} style={{
                display:"flex",alignItems:"center",gap:10,padding:sidebarOpen?"9px 14px":"9px 0",
                justifyContent:sidebarOpen?"flex-start":"center",
                border:"none",cursor:"pointer",fontFamily:"inherit",
                borderRadius:8,fontSize:13,fontWeight:active2?600:450,
                background:active2?"#F0FDFA":"transparent",
                color:active2?"#0D9488":"#64748B",
                transition:"all 0.15s",width:"100%",
              }}>
                {t==="roster"&&<CalendarIcon size={18} color={iconColor}/>}
                {t==="allocation"&&<IconGrid size={18} color={iconColor}/>}
                {t==="dates"&&<CalendarIcon size={18} color={iconColor}/>}
                {t==="volume"&&<IconBarChart size={18} color={iconColor}/>}
                {t==="agents"&&<IconUsers size={18} color={iconColor}/>}
                {t==="budget"&&<IconFileText size={18} color={iconColor}/>}
                {t==="payment"&&<IconFileText size={18} color={iconColor}/>}
                {t==="analytics"&&<IconBarChart size={18} color={iconColor}/>}
                {sidebarOpen && l}
              </button>
            );
          })}
        </div>

        {/* Sidebar footer — role + logout */}
        <div style={{padding:"12px",borderTop:"1px solid #F1F5F9"}}>
          {(() => {
            const prof = userProfiles[(loginUser||"").toLowerCase()] || {};
            const ownAgent = agents.find(a => (a.email && a.email.toLowerCase().trim() === (loginUser||"").toLowerCase().trim()) || (a.name && a.name.toLowerCase().trim() === (loginUser||"").toLowerCase().trim()));
            const profilePhoto = ownAgent?.profilePhotoUrl || "";
            const displayName = ownAgent?.fullName || prof.preferName || loginUser || ROLES[role]?.label || "User";
            const initial = displayName.charAt(0).toUpperCase();
            return (<>
          {role && sidebarOpen && (
            <div onClick={()=>setShowProfile(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:8,background:ROLES[role].bg,marginBottom:8,cursor:"pointer",transition:"opacity 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.opacity="0.8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
              {profilePhoto
                ? <img src={profilePhoto} alt="" style={{width:28,height:28,borderRadius:7,objectFit:"cover"}}/>
                : <div style={{width:28,height:28,borderRadius:7,background:ROLES[role].color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:ROLES[role].color}}>{initial}</div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:ROLES[role].color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{displayName}</div>
                <div style={{fontSize:9,color:ROLES[role].color+"99"}}>{ROLES[role].label} · Tap to edit profile</div>
              </div>
            </div>
          )}
          {role && !sidebarOpen && (
            <div onClick={()=>setShowProfile(true)} style={{display:"flex",justifyContent:"center",marginBottom:8,cursor:"pointer"}}>
              {profilePhoto
                ? <img src={profilePhoto} alt="" style={{width:32,height:32,borderRadius:8,objectFit:"cover"}}/>
                : <div style={{width:32,height:32,borderRadius:8,background:ROLES[role].bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:ROLES[role].color}}>{initial}</div>}
            </div>
          )}
            </>);
          })()}
          <div style={{display:"flex",gap:4,flexDirection:sidebarOpen?"row":"column",alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={()=>setShowUserMgmt(true)}
              style={{padding:"6px 10px",borderRadius:7,border:"1px solid #3B82F622",background:"#EFF6FF",color:"#1D4ED8",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flex:sidebarOpen?1:"unset",display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}>
              <IconUsers size={12} color="#1D4ED8"/>{sidebarOpen?(role==="manager"?" Users":" Account"):""}
            </button>
            {role==="manager" && (
              <button onClick={async ()=>{
                if(!window.confirm("Reset roster, brands, budget, and assignments to defaults?\n\nUser accounts will be PRESERVED.\n\nThis cannot be undone.")) return;
                // PRESERVE userAccounts and userProfiles across reset — don't wipe storage entirely.
                // Instead, reset only the operational state and let the save loop overwrite it.
                setAgents(ALLOC_AGENTS_INIT); setBrands(CS_BRANDS_INIT);
                setBudget(ALLOC_BUDGET); setFulltimeSalary({}); // FIX (HIGH): per-month object schema, not a bare number
                setAllAsgn({}); setAllBrandAsgn({}); setGlobalFlags(ALLOC_FLAGS_INIT);
                const seed={}; CS_BRANDS_INIT.forEach(b=>{seed[b.id]={...(b.chats||{})};});
                setMonthlyVol({"2026-03":seed});
                setRosterYear(2026); setRosterMonth(4); setLockedMonths({});
              }} style={{padding:"6px 10px",borderRadius:7,border:"1px solid #FCA5A533",background:"#FFF5F5",color:"#EF4444",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flex:sidebarOpen?1:"unset"}}>
                <IconTrash size={12} color="#EF4444" style={{display:"inline",verticalAlign:"-2px"}}/>{sidebarOpen?" Reset":""}
              </button>
            )}
            <button onClick={handleLogout}
              style={{padding:"6px 10px",borderRadius:7,border:"1px solid #E2E8F0",background:"transparent",color:"#64748B",fontSize:10,fontWeight:500,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4,justifyContent:"center",flex:sidebarOpen?1:"unset"}}>
              <IconLogOut size={12} color="#64748B"/>{sidebarOpen?" Sign out":""}
            </button>
          </div>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{marginTop:8,width:"100%",padding:"5px",border:"none",background:"transparent",cursor:"pointer",color:"#CBD5E1",fontSize:16,borderRadius:6}}>
            {sidebarOpen ? <IconChevL size={16} color="#CBD5E1"/> : <IconChevR size={16} color="#CBD5E1"/>}
          </button>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {/* ── Save status banner (FIX #5 from senior-dev review) ── */}
        {saveStatus === "error" && (
          <div style={{background:"#FEF2F2",borderBottom:"1px solid #FCA5A5",color:"#991B1B",padding:"8px 16px",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:50}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:"#EF4444",flexShrink:0}}/>
            <span>Couldn't save your last change. We'll keep retrying — please don't close this tab until it succeeds.</span>
            <button onClick={()=>{ needsSave.current = true; scheduleSave(); }} style={{marginLeft:"auto",padding:"4px 10px",borderRadius:6,border:"1px solid #991B1B",background:"transparent",color:"#991B1B",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Retry now</button>
          </div>
        )}
        {saveStatus === "saving" && (
          <div style={{background:"#EFF6FF",borderBottom:"1px solid #BFDBFE",color:"#1D4ED8",padding:"4px 16px",fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:8,position:"sticky",top:0,zIndex:50}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#3B82F6",flexShrink:0,animation:"spin 1s linear infinite"}}/>
            <span>Saving…</span>
          </div>
        )}
        {/* ── Top Bar ── */}
        <div style={{background:"#fff",borderBottom:"1px solid #E2E8F0",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",position:"sticky",top:0,zIndex:40}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:"#0F172A",letterSpacing:-0.2}}>
                {allocTab==="roster"?"Roster":allocTab==="payment"?"My Invoice":allocTab==="allocation"?"Allocation":allocTab==="dates"?"Dates":allocTab==="volume"?"Performance":allocTab==="agents"?"Teams":allocTab==="analytics"?"CS Analytics":"Report"}
              </div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{dateLabel} · {active.length} agents</div>
            </div>
          </div>

          <MonthPicker
            rosterYear={rosterYear} setRosterYear={setRosterYear}
            rosterMonth={rosterMonth} setRosterMonth={setRosterMonth}
            MONTHS={MONTHS}
          />
        </div>

        {/* ── Content Area ── */}
        <div style={{flex:1,padding:"24px 28px",overflowY:"auto"}}>

        {/* ── KPI Bar — Report tab only — range-aware ── */}
        {allocTab==="budget" && role!=="viewer" && (() => {
          // Compute range-aware costs (T2 pro-rated, T1+Return summed across range)
          const rs = reportStartDate || `${rosterYear}-${String(rosterMonth).padStart(2,"0")}-01`;
          const re = reportEndDate || `${rosterYear}-${String(rosterMonth).padStart(2,"0")}-${new Date(rosterYear, rosterMonth, 0).getDate()}`;
          const sD = new Date(rs + "T00:00:00");
          const eD = new Date(re + "T00:00:00");
          const isRangeSet = !!(reportStartDate || reportEndDate);

          // Months in range
          const rMonths = [];
          let cur = new Date(sD.getFullYear(), sD.getMonth(), 1);
          while (cur <= eD) {
            rMonths.push({ y: cur.getFullYear(), m: cur.getMonth() + 1 });
            cur.setMonth(cur.getMonth() + 1);
          }

          // T2 fulltime — prorate per-month salary by (days_in_range / days_in_month)
          // Each month uses its own salary value from the fulltimeSalary object.
          let t2Cost = 0;
          rMonths.forEach(({ y, m }) => {
            const mk = `${y}-${String(m).padStart(2,"0")}`;
            const monthSalary = (fulltimeSalary && fulltimeSalary[mk]) || 0;
            const daysInMonth = new Date(y, m, 0).getDate();
            const monthStart = new Date(y, m - 1, 1);
            const monthEnd = new Date(y, m, 0);
            const startInM = sD > monthStart ? sD : monthStart;
            const endInM = eD < monthEnd ? eD : monthEnd;
            const daysInRange = Math.round((endInM - startInM) / 86400000) + 1;
            t2Cost += monthSalary * (daysInRange / daysInMonth);
          });

          // T1+Return — sum worked-day cost across all dates in range (OT 1.5x)
          let t1rCost = 0;
          const t1r = agents.filter(a => a.active && a.team !== "T2");
          rMonths.forEach(({ y, m }) => {
            const mk = `${y}-${String(m).padStart(2,"0")}`;
            const monthAsgn = allAsgn[mk] || {};
            const daysInMonth = new Date(y, m, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
              const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
              const dt = new Date(ds + "T00:00:00");
              if (dt < sD || dt > eD) continue;
              t1r.forEach(ag => {
                const v = monthAsgn[`${ag.id}_${ds}`];
                if (v && v !== "Off" && v !== "TOIL") t1rCost += ag.costDay * (v === "OT" ? 1.5 : 1);
              });
            }
          });

          // Payment-period mode (default when no custom range is set):
          // mirror the Payment Period Summary exactly - 24th of prev month
          // to 23rd of the selected pay month, TOIL unpaid, OT 1.5x, and
          // T2 salary taken from the pay month.
          if (!isRangeSet) {
            const ppPrevM = payMonth === 1 ? 12 : payMonth - 1;
            const ppPrevY = payMonth === 1 ? payYear - 1 : payYear;
            const ppStart = `${ppPrevY}-${String(ppPrevM).padStart(2,"0")}-24`;
            const ppEnd   = `${payYear}-${String(payMonth).padStart(2,"0")}-23`;
            const ppDates = mkDateRange(ppStart, ppEnd);
            const ppAsgn  = {...(allAsgn[ppStart.slice(0,7)]||{}), ...(allAsgn[ppEnd.slice(0,7)]||{})};
            const ppXtra  = {...(allExtraHrs[ppStart.slice(0,7)]||{}), ...(allExtraHrs[ppEnd.slice(0,7)]||{})};
            t1rCost = 0;
            agents.filter(a => a.active && a.team !== "T2").forEach(ag => {
              ppDates.forEach(d => {
                const v = ppAsgn[`${ag.id}_${d.date}`];
                if (!v || v === "Off" || v === "TOIL") return;
                t1rCost += ag.costDay * (v === "OT" ? 1.5 : 1);
                const e = ppXtra[`${ag.id}_${d.date}`];
                if (e && e.h) t1rCost += e.h * (ag.costDay/8) * (e.x || 1);
              });
            });
            t2Cost = (fulltimeSalary && fulltimeSalary[`${payYear}-${String(payMonth).padStart(2,"0")}`]) || 0;
          }
          const grand = Math.round(t2Cost + t1rCost);
          const t2Rounded = Math.round(t2Cost);
          const t1rRounded = Math.round(t1rCost);
          const rangeLabel = isRangeSet
            ? `${rs} → ${re}`
            : `Pay period 24 ${MONTHS[(payMonth===1?12:payMonth-1)-1]} - 23 ${MONTHS[payMonth-1]} ${payYear}`;

          return (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:22}}>
              <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #E2E8F0",boxShadow:"0 1px 3px #0001"}}>
                <div style={{fontSize:10,color:"#1D4ED8",fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>T2 — Fixed Salary</div>
                <div style={{fontSize:22,fontWeight:700,color:"#1D4ED8"}}>฿{t2Rounded.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#94A3B8",marginTop:4}}>{t2Agents.filter(a=>a.active).length} fulltime · {rangeLabel}</div>
              </div>
              <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:"1px solid #E2E8F0",boxShadow:"0 1px 3px #0001"}}>
                <div style={{fontSize:10,color:"#0D9488",fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>T1 + Return + CC</div>
                <div style={{fontSize:22,fontWeight:700,color:"#0D9488"}}>฿{t1rRounded.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#94A3B8",marginTop:4}}>{agents.filter(a=>a.active&&a.team!=="T2").length} agents · {rangeLabel}</div>
              </div>
              <div style={{background:"#fff",borderRadius:12,padding:"16px 20px",border:`1px solid ${grand>totalBudget?"#FCA5A5":"#BBF7D0"}`,boxShadow:"0 1px 3px #0001"}}>
                <div style={{fontSize:10,color:"#64748B",fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Grand Total</div>
                <div style={{fontSize:22,fontWeight:700,color:grand>totalBudget?"#EF4444":"#059669"}}>฿{grand.toLocaleString()}</div>
                <div style={{fontSize:10,color:"#94A3B8",marginTop:4}}>All teams · {rangeLabel}</div>
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════
            ROSTER TAB
        ══════════════════════════════════════════ */}
        {allocTab==="roster" && myAgent && (
              <div>
                {/* Personal header — full name (preferred), profile photo, agent ID badge */}
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:"20px 24px",marginBottom:16,display:"flex",alignItems:"center",gap:16}}>
                  {myAgent.profilePhotoUrl
                    ? <img src={myAgent.profilePhotoUrl} alt="" style={{width:48,height:48,borderRadius:12,objectFit:"cover"}}/>
                    : <div style={{width:48,height:48,borderRadius:12,background:"#F0FDFA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:"#0D9488"}}>{(myAgent.fullName || myAgent.name).charAt(0)}</div>}
                  <div style={{flex:1}}>
                    <div style={{fontSize:18,fontWeight:700,color:"#0F172A"}}>
                      {myAgent.fullName ? <>{myAgent.fullName} <span style={{color:"#94A3B8",fontWeight:500,fontSize:14}}>({myAgent.name})</span></> : myAgent.name}
                    </div>
                    <div style={{fontSize:12,color:"#94A3B8",marginTop:4,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{padding:"2px 8px",borderRadius:6,background:"#F0FDFA",color:"#0D9488",fontWeight:700,fontSize:11,fontFamily:"monospace"}}>{myAgent.id}</span>
                      {myAgent.rule && <span style={{color:"#D97706"}}>({myAgent.rule})</span>}
                    </div>
                  </div>
                </div>

                {/* Manager-requested shift changes (need my Accept) + tomorrow-morning reminder */}
                {(()=>{
                  const tRef = new Date(); tRef.setDate(tRef.getDate()+1);
                  const tomorrowStr = `${tRef.getFullYear()}-${String(tRef.getMonth()+1).padStart(2,"0")}-${String(tRef.getDate()).padStart(2,"0")}`;
                  const tomorrowShift = (allAsgn[tomorrowStr.slice(0,7)]||{})[`${myAgent.id}_${tomorrowStr}`];
                  const mgrPending = changeRequests.filter(r=>r.agentId===myAgent.id && r.status==="pending" && r.origin==="manager");
                  return (
                    <>
                      {mgrPending.map(r=>{
                        const hot = r.date===tomorrowStr && r.requestedShift==="M";
                        return (
                          <div key={r.id} style={{background:hot?"#FEF2F2":"#F0FDFA",border:`1px solid ${hot?"#FCA5A5":"#99F6E4"}`,borderRadius:12,padding:"12px 16px",marginBottom:16}}>
                            <div style={{fontSize:12,fontWeight:700,color:hot?"#B91C1C":"#0F766E"}}>Shift change requested by {r.requestedBy||"manager"}</div>
                            <div style={{fontSize:12,color:"#334155",marginTop:4}}>{r.date}: change to <b>{r.requestedShift}</b> (currently {r.currentShift||"unset"})</div>
                            {hot && <div style={{fontSize:11,fontWeight:700,color:"#B91C1C",marginTop:6}}>This is TOMORROW and it is a MORNING shift (starts 07:00). Accept only if you can make it.</div>}
                            <div style={{display:"flex",gap:8,marginTop:10}}>
                              <button onClick={()=>{
                                const rv = violatesRest(r.agentId, r.date, r.requestedShift);
                                if (rv) { alert("This change now conflicts with the rest rule (Evening and Morning back-to-back). Please Decline and ask your manager for a new request."); return; }
                                applyShiftForDate(r.agentId, r.date, r.requestedShift);
                                setChangeRequests(prev=>prev.map(x=>x.id===r.id?{...x,status:"approved",acceptedAt:new Date().toISOString()}:x));
                              }} style={{padding:"6px 16px",borderRadius:8,border:"none",background:"#D1FAE5",color:"#059669",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Accept</button>
                              <button onClick={()=>{
                                setChangeRequests(prev=>prev.map(x=>x.id===r.id?{...x,status:"rejected"}:x));
                              }} style={{padding:"6px 16px",borderRadius:8,border:"none",background:"#FEE2E2",color:"#DC2626",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Decline</button>
                            </div>
                          </div>
                        );
                      })}
                      {tomorrowShift==="M" && (
                        <div style={{background:"#FFFBEB",border:"1px solid #FCD34D",borderRadius:12,padding:"10px 16px",marginBottom:16,fontSize:12,color:"#92400E",fontWeight:600}}>
                          Reminder: tomorrow ({tomorrowStr}) you are on Morning shift - starts 07:00
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* My Schedule — Calendar view */}
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",marginBottom:16}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",fontSize:12,fontWeight:700,color:"#1A1D2E"}}>My Schedule — {dateLabel}</div>
                  <div style={{padding:"16px"}}>
                    {/* Day-of-week headers (Mon–Sun) */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:6}}>
                      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((dn,i) => (
                        <div key={dn} style={{textAlign:"center",fontSize:10,fontWeight:700,color:i>=5?"#EF4444":"#94A3B8",padding:"6px 0",textTransform:"uppercase",letterSpacing:0.5}}>{dn}</div>
                      ))}
                    </div>
                    {/* Calendar grid — pad empty cells before the 1st of the month */}
                    {(() => {
                      const first = dates[0];
                      // Mon=0, Tue=1, ..., Sun=6 (so weekday 0=Sun becomes index 6)
                      const offset = first ? ((first.wd + 6) % 7) : 0;
                      const cells = [];
                      for (let i = 0; i < offset; i++) cells.push({empty: true, key: `pad-${i}`});
                      dates.forEach(d => cells.push({d, empty: false, key: d.date}));
                      // Pad trailing to complete the last week row
                      while (cells.length % 7 !== 0) cells.push({empty: true, key: `tail-${cells.length}`});
                      return (
                        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
                          {cells.map(c => {
                            if (c.empty) return <div key={c.key} style={{minHeight:72}}/>;
                            const d = c.d;
                            const cellK = `${myAgent.id}_${d.date}`;
                            const val = asgn[cellK];
                            const cs = val ? ALLOC_SHIFT_C[val] : null;
                            const editing = role==="viewer" && cellKey===cellK;
                            const hasPending = changeRequests.some(r=>r.agentId===myAgent.id && r.date===d.date && r.status==="pending");
                            const fl = flags[d.date]; const isH = fl?.type==="holiday"; const isC = fl?.type==="campaign";
                            const bg = isH ? "#FEF3C7" : isC ? "#F0FDFA" : d.isWE ? "#FFF5F5" : "#fff";
                            return (
                              <div key={d.date} style={{minHeight:72,border:selectedRosterDate===d.date?"2px solid #0D9488":"1px solid #E2E8F0",borderRadius:8,background:bg,padding:"6px 8px",position:"relative",cursor:(role==="viewer"||role==="t1"||role==="return"||role==="cc")?"pointer":"default",boxShadow:selectedRosterDate===d.date?"0 0 0 2px #99F6E4":"none"}}
                                onClick={()=>{
                                  if(role==="viewer") setCellKey(editing?null:cellK);
                                  if(role==="t1"||role==="return"||role==="cc") setSelectedRosterDate(selectedRosterDate===d.date?null:d.date);
                                }}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                                  <div style={{fontSize:11,fontWeight:700,color:d.isWE?"#EF4444":"#1A1D2E"}}>{Number(d.dd)}</div>
                                  {hasPending && <div style={{width:6,height:6,borderRadius:3,background:"#F59E0B"}}/>}
                                </div>
                                {fl && <div style={{fontSize:8,fontWeight:700,color:isH?"#D97706":"#0D9488",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fl.label}</div>}
                                <div style={{marginTop:6,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  {cs ? <div style={{background:cs.bg,color:cs.color,borderRadius:6,padding:"4px 8px",fontWeight:700,fontSize:12,width:"100%",textAlign:"center"}}>{cs.label}</div>
                                       : <div style={{color:"#CBD5E1",fontSize:11}}>—</div>}
                                </div>
                                {editing && (
                                  <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",left:0,zIndex:50,background:"#fff",border:"1px solid #E2E8F0",borderRadius:10,boxShadow:"0 8px 24px #00000022",padding:12,width:180,fontSize:12}}>
                                    <div style={{fontWeight:700,color:"#1A1D2E",marginBottom:4,fontSize:11}}>Request Change</div>
                                    <div style={{fontSize:10,color:"#94A3B8",marginBottom:8}}>{d.dd}/{d.mm} {d.day} · Currently: {val||"Unset"}</div>
                                    {["M","E","ME","Off"].map(code => {
                                      const cs2=ALLOC_SHIFT_C[code];
                                      return (
                                        <button key={code} onClick={()=>{
                                          setChangeRequests(prev=>[...prev,{
                                            id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
                                            agentId:myAgent.id, agentName:myAgent.name, date:d.date,
                                            requestedShift:code, currentShift:val||"",
                                            reason:"", status:"pending", requestedBy:loginUser,
                                            timestamp:new Date().toISOString()
                                          }]);
                                          setCellKey(null);
                                        }}
                                          style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"5px 8px",border:"1px solid #E2E8F0",borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:11,background:"transparent",color:cs2?.color||"#1A1D2E",marginBottom:2}}>
                                          <span style={{width:24,height:16,borderRadius:3,background:cs2?.bg,color:cs2?.color,fontWeight:700,fontSize:9,textAlign:"center",lineHeight:"14px",flexShrink:0}}>{cs2?.label}</span>
                                          {code==="M"?"Morning":code==="ME"?"Mid":code==="E"?"Evening":"Day Off"}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Summary stats */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:16}}>
                  {[
                    ["Work Days", dates.filter(d=>{const v=asgn[`${myAgent.id}_${d.date}`];return v&&v!=="Off";}).length, "#0D9488"],
                    ["Days Off", dates.filter(d=>{const v=asgn[`${myAgent.id}_${d.date}`];return v==="Off";}).length, "#EF4444"],
                    ["Morning", dates.filter(d=>asgn[`${myAgent.id}_${d.date}`]==="M").length, "#1D4ED8"],
                    ["Evening", dates.filter(d=>asgn[`${myAgent.id}_${d.date}`]==="E").length, "#065F46"],
                  ].map(([label,count,color])=>(
                    <div key={label} style={{background:"#fff",borderRadius:10,border:"1px solid #E2E8F0",padding:"12px 16px",textAlign:"center"}}>
                      <div style={{fontSize:22,fontWeight:700,color}}>{count}</div>
                      <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* My Brand Assignments — only for the selected date */}
                {/* Request Change strip — T1 picks a new shift for the selected date, shown right above brand assignments */}
                {(role==="t1"||role==="return"||role==="cc") && selectedRosterDate && (()=>{
                  const dSel = dates.find(x=>x.date===selectedRosterDate);
                  const cur = asgn[`${myAgent.id}_${selectedRosterDate}`] || "";
                  const pendingHere = changeRequests.some(r=>r.agentId===myAgent.id && r.date===selectedRosterDate && r.status==="pending");
                  return (
                    <div style={{background:"#fff",borderRadius:14,border:"1px solid #99F6E4",padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#0D9488"}}>Request Change {dSel?`${dSel.dd}/${dSel.mm} ${dSel.day}`:""}</div>
                      <div style={{fontSize:11,color:"#94A3B8"}}>Currently: <b style={{color:"#1A1D2E"}}>{cur||"Unset"}</b></div>
                      {pendingHere ? (
                        <span style={{fontSize:11,fontWeight:700,color:"#D97706",background:"#FEF3C7",padding:"4px 10px",borderRadius:6,marginLeft:"auto"}}>Request pending — waiting for approval</span>
                      ) : (
                        <div style={{display:"flex",gap:6,marginLeft:"auto",flexWrap:"wrap"}}>
                          {["M","ME","E","Off"].map(code=>{
                            const cs2=ALLOC_SHIFT_C[code];
                            return (
                              <button key={code} onClick={()=>{
                                setChangeRequests(prev=>[...prev,{
                                  id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
                                  agentId:myAgent.id, agentName:myAgent.name, date:selectedRosterDate,
                                  requestedShift:code, currentShift:cur,
                                  reason:"", status:"pending", requestedBy:loginUser,
                                  timestamp:new Date().toISOString()
                                }]);
                              }} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:cs2?.bg||"#F1F5F9",color:cs2?.color||"#1A1D2E",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{code==="M"?"Morning":code==="ME"?"Mid":code==="E"?"Evening":"Day Off"}</button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden"}}>
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",fontSize:12,fontWeight:700,color:"#1A1D2E",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>My Brand Assignments {selectedRosterDate ? (()=>{const d=dates.find(x=>x.date===selectedRosterDate);return d?`— ${d.dd}/${d.mm} ${d.day}`:"";})() : ""}</span>
                    {selectedRosterDate && (
                      <button onClick={()=>setSelectedRosterDate(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#64748B",fontSize:11,fontFamily:"inherit"}}>Clear date</button>
                    )}
                  </div>
                  {!selectedRosterDate ? (
                    <div style={{padding:32,textAlign:"center",color:"#94A3B8",fontSize:13}}>
                      Click a date in the calendar above to see your brand assignments for that day.
                    </div>
                  ) : myBrandsForDate.length === 0 ? (
                    <div style={{padding:24,textAlign:"center",color:"#94A3B8",fontSize:13}}>No brand assignments for this date.</div>
                  ) : (
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#F8FAFC"}}>
                        {["Brand","Warehouse","Platform","Shift"].map(h=>(
                          <th key={h} style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {myBrandsForDate.map((mb,i) => (
                          <tr key={`${mb.brand}|${mb.plat}|${mb.shift}`} style={{borderBottom:"1px solid #F1F5F9",background:i%2===0?"#FAFBFC":"transparent"}}>
                            <td style={{padding:"8px 12px",fontWeight:600,color:"#1A1D2E"}}>{mb.brand}</td>
                            <td style={{padding:"8px 12px"}}><span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"#F1F5F9",color:"#94A3B8",fontWeight:600}}>{mb.wh||"—"}</span></td>
                            <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:PLATFORM_C[mb.plat]?.bg||"#F1F5F9",color:PLATFORM_C[mb.plat]?.color||"#64748B",fontWeight:700}}>{mb.plat}</span></td>
                            <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:mb.shiftCode==="M"?"#DBEAFE":mb.shiftCode==="ME"?"#F0FDFA":"#D1FAE5",color:mb.shiftCode==="M"?"#1D4ED8":mb.shiftCode==="ME"?"#0F766E":"#065F46",fontWeight:700}}>{mb.shift}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* My Pending Requests */}
                {/* On Duty: teammates working on the selected date + their brands */}
                {selectedRosterDate && (()=>{
                  const dSel = dates.find(x=>x.date===selectedRosterDate);
                  const SH_ORDER = {M:0, ME:1, E:2};
                  const onDuty = agents.filter(a=>a.active && ["M","ME","E"].includes(asgn[`${a.id}_${selectedRosterDate}`]))
                    .sort((a,b)=>{const sa=SH_ORDER[asgn[`${a.id}_${selectedRosterDate}`]], sb=SH_ORDER[asgn[`${b.id}_${selectedRosterDate}`]]; return sa!==sb?sa-sb:String(a.id).localeCompare(String(b.id),undefined,{numeric:true});});
                  return (
                    <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",marginTop:16,marginBottom:16}}>
                      <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",fontSize:12,fontWeight:700,color:"#1A1D2E"}}>
                        On Duty {dSel?`- ${dSel.dd}/${dSel.mm} ${dSel.day}`:""} ({onDuty.length} working)
                      </div>
                      {onDuty.length===0 ? (
                        <div style={{padding:24,textAlign:"center",color:"#94A3B8",fontSize:13}}>No one is scheduled on this date.</div>
                      ) : onDuty.map(a=>{
                        const sh = asgn[`${a.id}_${selectedRosterDate}`]; const cs = ALLOC_SHIFT_C[sh];
                        const open = dutyOpen===a.id;
                        const bl = open ? brandsForAgentOn(a, selectedRosterDate) : [];
                        return (
                          <div key={a.id} style={{borderTop:"1px solid #F1F5F9"}}>
                            <div onClick={()=>setDutyOpen(open?null:a.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 16px",cursor:"pointer",background:open?"#F8FAFC":"#fff"}}>
                              <span style={{fontSize:10,padding:"2px 7px",borderRadius:6,background:"#F0FDFA",color:"#0D9488",fontWeight:700,fontFamily:"monospace"}}>{a.id}</span>
                              <span style={{fontSize:12,fontWeight:600,color:a.id===myAgent.id?"#0D9488":"#1A1D2E"}}>{a.name}{a.id===myAgent.id?" (you)":""}</span>
                              <span style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",borderRadius:4,background:cs?.bg,color:cs?.color,fontWeight:700}}>{sh}</span>
                              <span style={{fontSize:10,color:"#0D9488",fontWeight:600}}>{open?"Hide":"View brands"}</span>
                            </div>
                            {open && (
                              <div style={{padding:"4px 16px 10px 16px",background:"#F8FAFC"}}>
                                {bl.length===0 ? <div style={{fontSize:11,color:"#94A3B8",padding:"4px 0"}}>No brand assignments this day.</div> :
                                  bl.map((x,i)=>(
                                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",fontSize:11}}>
                                      <span style={{fontWeight:600,color:"#1A1D2E"}}>{x.brand}</span>
                                      {x.wh ? <span style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:"#F1F5F9",color:"#64748B",fontWeight:700}}>{x.wh}</span> : null}
                                      <span style={{marginLeft:"auto",fontSize:9,padding:"1px 6px",borderRadius:4,background:"#EFF6FF",color:"#1D4ED8",fontWeight:700}}>{x.plat}</span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {changeRequests.filter(r=>r.agentId===myAgent.id).length > 0 && (
                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden",marginTop:16}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#FEF3C7",fontSize:12,fontWeight:700,color:"#92400E"}}>My Change Requests</div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#F8FAFC"}}>
                        {["Date","Current","Requested","Status"].map(h=>(
                          <th key={h} style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {changeRequests.filter(r=>r.agentId===myAgent.id).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).map(r=>(
                          <tr key={r.id} style={{borderBottom:"1px solid #F1F5F9"}}>
                            <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:600}}>{r.date}</td>
                            <td style={{padding:"8px 12px"}}>{r.currentShift ? <span style={{padding:"2px 8px",borderRadius:4,background:ALLOC_SHIFT_C[r.currentShift]?.bg,color:ALLOC_SHIFT_C[r.currentShift]?.color,fontWeight:700,fontSize:10}}>{r.currentShift}</span> : "—"}</td>
                            <td style={{padding:"8px 12px"}}><span style={{padding:"2px 8px",borderRadius:4,background:ALLOC_SHIFT_C[r.requestedShift]?.bg,color:ALLOC_SHIFT_C[r.requestedShift]?.color,fontWeight:700,fontSize:10}}>{r.requestedShift}</span></td>
                            <td style={{padding:"8px 12px"}}><span style={{padding:"2px 8px",borderRadius:6,fontSize:10,fontWeight:700,background:r.status==="pending"?"#FEF3C7":r.status==="approved"?"#D1FAE5":"#FEE2E2",color:r.status==="pending"?"#D97706":r.status==="approved"?"#059669":"#DC2626"}}>{r.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
        )}

        {allocTab==="roster" && !myAgent && (role==="t1"||role==="viewer") && (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:"48px 24px",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#1A1D2E",marginBottom:8}}>No personal schedule linked</div>
            <div style={{fontSize:12,color:"#64748B",maxWidth:420,margin:"0 auto",lineHeight:1.5}}>
              Your account <code style={{background:"#F1F5F9",padding:"2px 6px",borderRadius:4,fontFamily:"monospace",fontSize:11}}>{loginUser}</code> isn't linked to an agent yet.
              <br/>Ask your manager to open <strong>Teams</strong> → edit your agent record → fill in the <strong>Email</strong> field with this address.
            </div>
          </div>
        )}

        {allocTab==="roster" && !myAgent && role!=="viewer" && role!=="t1" && (
          <div>
            {/* ── Pending Change Requests (manager/fulltime approval) ── */}
            {/* Manager/T2: request a shift change (agent must accept before it applies) */}
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E",marginBottom:10}}>Request Shift Change <span style={{fontWeight:500,color:"#94A3B8"}}>(applies only after the agent accepts)</span></div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <select value={mgrReq.agentId} onChange={e=>setMgrReq(p=>({...p,agentId:e.target.value}))} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit"}}>
                  <option value="">Select agent...</option>
                  {agents.filter(a=>a.active && a.team!=="T2").sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true})).map(a=>(
                    <option key={a.id} value={a.id}>{a.id} - {a.name}</option>
                  ))}
                </select>
                <input type="date" value={mgrReq.date} onChange={e=>setMgrReq(p=>({...p,date:e.target.value}))} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit"}}/>
                <select value={mgrReq.shift} onChange={e=>setMgrReq(p=>({...p,shift:e.target.value}))} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit"}}>
                  {["M","ME","E","Off"].map(s=><option key={s} value={s}>{s==="M"?"Morning (M)":s==="ME"?"Mid (ME)":s==="E"?"Evening (E)":"Day Off"}</option>)}
                </select>
                <button onClick={()=>{
                  if(!mgrReq.agentId || !mgrReq.date) return;
                  const ag = agents.find(a=>a.id===mgrReq.agentId); if(!ag) return;
                  const cur = (allAsgn[mgrReq.date.slice(0,7)]||{})[`${mgrReq.agentId}_${mgrReq.date}`] || "";
                  const rv = violatesRest(mgrReq.agentId, mgrReq.date, mgrReq.shift);
                  if (rv) { alert(rv==="M-after-E" ? `${ag.name} works Evening the day before ${mgrReq.date} (ends 01:00). Morning would give only 6h rest.` : `${ag.name} works Morning the day after ${mgrReq.date}. Evening ends 01:00 - only 6h rest.`); return; }
                  setChangeRequests(prev=>[...prev,{
                    id: Date.now().toString(36)+Math.random().toString(36).slice(2,6),
                    agentId:ag.id, agentName:ag.name, date:mgrReq.date,
                    requestedShift:mgrReq.shift, currentShift:cur,
                    reason:"", status:"pending", origin:"manager", requestedBy:loginUser,
                    timestamp:new Date().toISOString()
                  }]);
                  setMgrReq({agentId:"",date:"",shift:"M"});
                }} style={{padding:"7px 18px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Send Request</button>
              </div>
              {changeRequests.filter(r=>r.status==="pending" && r.origin==="manager").length>0 && (
                <div style={{marginTop:12,borderTop:"1px solid #F1F5F9",paddingTop:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",marginBottom:6}}>Awaiting agent confirmation</div>
                  {changeRequests.filter(r=>r.status==="pending" && r.origin==="manager").map(r=>(
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,fontSize:11,padding:"4px 0",color:"#334155"}}>
                      <b>{r.agentName}</b><span style={{fontFamily:"monospace"}}>{r.date}</span>
                      <span>change to <b>{r.requestedShift}</b> (currently {r.currentShift||"unset"})</span>
                      <button onClick={()=>setChangeRequests(prev=>prev.filter(x=>x.id!==r.id))} style={{marginLeft:"auto",padding:"3px 10px",borderRadius:6,border:"none",background:"#F1F5F9",color:"#64748B",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {changeRequests.filter(r=>r.status==="pending" && r.origin!=="manager").length > 0 && (
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #FCD34D",overflow:"hidden",marginBottom:16}}>
                <div style={{padding:"12px 16px",borderBottom:"1px solid #FDE68A",background:"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#92400E"}}>Pending Change Requests ({changeRequests.filter(r=>r.status==="pending" && r.origin!=="manager").length})</div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#FFFBEB"}}>
                    {["Agent","Date","Current","Requested","Requested At","Actions"].map(h=>(
                      <th key={h} style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #FDE68A",fontSize:10,fontWeight:700,color:"#92400E",textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {changeRequests.filter(r=>r.status==="pending" && r.origin!=="manager").map(r=>(
                      <tr key={r.id} style={{borderBottom:"1px solid #F1F5F9"}}>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#1A1D2E"}}>{r.agentName}</td>
                        <td style={{padding:"8px 12px",fontFamily:"monospace"}}>{r.date}</td>
                        <td style={{padding:"8px 12px"}}>{r.currentShift ? <span style={{padding:"2px 8px",borderRadius:4,background:ALLOC_SHIFT_C[r.currentShift]?.bg,color:ALLOC_SHIFT_C[r.currentShift]?.color,fontWeight:700,fontSize:10}}>{r.currentShift}</span> : "—"}</td>
                        <td style={{padding:"8px 12px"}}><span style={{padding:"2px 8px",borderRadius:4,background:ALLOC_SHIFT_C[r.requestedShift]?.bg,color:ALLOC_SHIFT_C[r.requestedShift]?.color,fontWeight:700,fontSize:10}}>{r.requestedShift}</span></td>
                        <td style={{padding:"8px 12px",fontSize:10,color:"#94A3B8"}}>{new Date(r.timestamp).toLocaleString()}</td>
                        <td style={{padding:"8px 12px",display:"flex",gap:6}}>
                          <button onClick={()=>{
                            applyShiftForDate(r.agentId, r.date, r.requestedShift);
                            setChangeRequests(prev=>prev.map(x=>x.id===r.id?{...x,status:"approved"}:x));
                          }} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"#D1FAE5",color:"#059669",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Approve</button>
                          <button onClick={()=>{
                            setChangeRequests(prev=>prev.map(x=>x.id===r.id?{...x,status:"rejected"}:x));
                          }} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"#FEE2E2",color:"#DC2626",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Controls */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:1,minWidth:160}}>
                <Search size={12} color="#94A3B8" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)"}}/>
                <input value={rosterSearch} onChange={e=>setRosterSearch(e.target.value)} placeholder="Search agent…"
                  style={{...inpS,paddingLeft:28,width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                {[["all","All"],["T1","T1"],["Return","Return"],["CC","CC"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setRosterTeam(v)} style={{
                    padding:"6px 12px",borderRadius:8,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",
                    background:rosterTeam===v?(v==="all"?"#14B8A6":ALLOC_TEAM_C[v]?.bg||"#F0FDFA"):"#F1F5F9",
                    color:rosterTeam===v?(v==="all"?"#fff":ALLOC_TEAM_C[v]?.color||"#5EEAD4"):"#6B7280",
                  }}>{l}</button>
                ))}
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                {/* Lock/Unlock toggle — manager only */}
                {role==="manager" && (
                  <button onClick={toggleLock} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${isLocked?"#F59E0B":"#E2E8F0"}`,background:isLocked?"#FEF3C7":"transparent",color:isLocked?"#D97706":"#94A3B8",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    {isLocked?"Locked":"Lock"}
                  </button>
                )}
                {isLocked && (
                  <span style={{fontSize:10,color:"#D97706",fontWeight:600,padding:"4px 10px",background:"#FEF3C7",borderRadius:6}}>Month is locked</span>
                )}
                <button onClick={()=>{if(isLocked){alert("This month is locked. Unlock it first to make changes.");return;}safeSetAsgn({});}} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"transparent",color:isLocked?"#CBD5E1":"#6B7280",fontSize:12,cursor:isLocked?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:600}}>Clear</button>
                <button onClick={()=>{if(isLocked){alert("This month is locked. Unlock it first to make changes.");return;}setFillMode("all");setFillModal(true);}}
                  style={{padding:"6px 14px",borderRadius:8,border:"none",background:isLocked?"#CBD5E1":"#0D9488",color:"#fff",fontSize:12,cursor:isLocked?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:700}}>Auto-Fill</button>
                <div style={{width:1,background:"#E2E8F0",margin:"0 2px"}}/>
                <button onClick={exportRosterXLSX}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid #06C75544",background:"#ECFDF5",color:"#065F46",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                  Export
                </button>
                <button onClick={exportRosterPDF}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid #F87171",background:"#FFF5F5",color:"#B91C1C",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
                  PDF
                </button>
              </div>
            </div>

            {/* ── Auto-Fill Inquiry Modal ── */}
            {fillModal && (
              <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)"}} onClick={()=>setFillModal(false)}>
                <div style={{background:"#FFFFFF",borderRadius:18,border:"1px solid #E2E8F0",padding:28,width:580,maxWidth:"95vw",maxHeight:"88vh",overflow:"auto",boxShadow:"0 24px 64px #00000099"}} onClick={e=>e.stopPropagation()}>
                  {/* Modal header */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                    <div>
                      <div style={{fontSize:16,fontWeight:700,color:"#1A1D2E",display:"flex",alignItems:"center",gap:8}}>
                        Auto-Fill Setup
                      </div>
                      <div style={{fontSize:11,color:"#94A3B8",marginTop:3}}>
                        {fillMode==="fill" ? "Fill only empty cells — existing assignments kept" : "Re-fill entire roster — all T1 assignments replaced"}
                      </div>
                    </div>
                    <button onClick={()=>setFillModal(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6B7280",fontSize:20,lineHeight:1}}>×</button>
                  </div>

                  {/* Mode toggle */}
                  <div style={{display:"flex",gap:4,background:"#FAFBFC",borderRadius:10,padding:4,marginBottom:22}}>
                    {[["all","🔄 Fill All T1"],["fill","➕ Fill Empty Only"]].map(([m,l])=>(
                      <button key={m} onClick={()=>setFillMode(m)} style={{
                        flex:1,padding:"8px 0",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,borderRadius:8,fontFamily:"inherit",transition:"all 0.15s",
                        background:fillMode===m?"#F0FDFA":"transparent",
                        color:fillMode===m?"#5EEAD4":"#94A3B8",
                        borderBottom:fillMode===m?"2px solid #14B8A6":"2px solid transparent"
                      }}>{l}</button>
                    ))}
                  </div>

                  {/* Section: Shift Requirements */}
                  <div style={{marginBottom:22}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#0D9488",textTransform:"uppercase",letterSpacing:1,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:3,height:14,background:"#5EEAD4",borderRadius:2,display:"inline-block"}}/>
                      T1 Agents per Shift (Default — all dates)
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
                      {[
                        ["needM",  fillNeedM,  setFillNeedM,  "M",  "AM",  "#60A5FA"],
                        ["needME", fillNeedME, setFillNeedME, "ME", "MID",      "#5EEAD4"],
                        ["needE",  fillNeedE,  setFillNeedE,  "E",  "PM",  "#34D399"],
                      ].map(([,val,setter,code,label,color])=>(
                        <div key={code} style={{background:"#FAFBFC",borderRadius:10,padding:"12px 14px",border:`1px solid ${color}33`}}>
                          <div style={{fontSize:11,fontWeight:700,color,marginBottom:8}}>{label}</div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <button onClick={()=>setter(Math.max(0,val-1))} style={{width:26,height:26,borderRadius:6,border:`1px solid ${color}44`,background:"transparent",color,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>−</button>
                            <span style={{fontSize:20,fontWeight:700,color,fontFamily:"monospace",minWidth:24,textAlign:"center"}}>{val}</span>
                            <button onClick={()=>setter(val+1)} style={{width:26,height:26,borderRadius:6,border:`1px solid ${color}44`,background:"transparent",color,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>
                          </div>
                          <div style={{fontSize:9,color:"#94A3B8",marginTop:6}}>agents minimum</div>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:10,padding:"8px 12px",background:"#F1F5F9",borderRadius:8,fontSize:11,color:"#94A3B8"}}>
                      Total: <strong style={{color:"#1A1D2E"}}>{fillNeedM+fillNeedME+fillNeedE}</strong> T1 agents required per day
                      {fillNeedM+fillNeedME+fillNeedE > agents.filter(a=>a.active&&a.team==="T1").length && (
                        <span style={{color:"#B91C1C",marginLeft:8}}>— Exceeds {agents.filter(a=>a.active&&a.team==="T1").length} available T1 agents</span>
                      )}
                    </div>
                  </div>

                  {/* Section: Budget & Chat Constraints */}
                  <div style={{marginBottom:22}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#B45309",textTransform:"uppercase",letterSpacing:1,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:3,height:14,background:"#F59E0B",borderRadius:2,display:"inline-block"}}/>
                      Budget & Chat Constraints
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      {/* Daily budget cap */}
                      <div style={{background:"#FAFBFC",borderRadius:10,padding:"14px"}}>
                        <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:6}}>Daily Budget Cap (฿)</label>
                        <div style={{position:"relative"}}>
                          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"#94A3B8",fontSize:13}}>฿</span>
                          <input type="number" min="0" value={fillBudget} onChange={e=>setFillBudget(e.target.value)}
                            placeholder="Unlimited"
                            style={{width:"100%",padding:"8px 10px 8px 24px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FFFFFF",color:"#B45309",fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                        </div>
                        <div style={{fontSize:9,color:"#94A3B8",marginTop:5}}>Max spend on T1 agents per day. Leave blank = no limit.</div>
                        {fillBudget && (
                          <div style={{fontSize:10,color:"#B45309",marginTop:4}}>
                            ~{Math.floor(Number(fillBudget)/((agents.filter(a=>a.active&&a.team==="T1").reduce((s,a)=>s+a.costDay,0)/Math.max(1,agents.filter(a=>a.active&&a.team==="T1").length))))} agents can work / day at avg rate
                          </div>
                        )}
                      </div>
                      {/* Chat per agent cap */}
                      <div style={{background:"#FAFBFC",borderRadius:10,padding:"14px"}}>
                        <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:6}}>Max Chats per Agent / Day</label>
                        <input type="number" min="0" value={fillChatCap} onChange={e=>setFillChatCap(e.target.value)}
                          placeholder="Unlimited"
                          style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FFFFFF",color:"#065F46",fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                        <div style={{fontSize:9,color:"#94A3B8",marginTop:5}}>Sets min headcount from chat load. Leave blank = no limit.</div>
                        {fillChatCap && (() => {
                          const totalChats = brands.reduce((s,b)=>s+Object.values(b.chats||{}).reduce((a,v)=>a+v,0),0)/30;
                          const needed = Math.ceil(totalChats/Number(fillChatCap));
                          return <div style={{fontSize:10,color:"#065F46",marginTop:4}}>~{needed} agents needed for avg {Math.round(totalChats)} chats/day</div>;
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Section: Per-date overrides */}
                  <div style={{marginBottom:22}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#1D4ED8",textTransform:"uppercase",letterSpacing:1,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                      <span style={{width:3,height:14,background:"#60A5FA",borderRadius:2,display:"inline-block"}}/>
                      Per-Date Overrides <span style={{fontWeight:400,color:"#94A3B8",fontSize:9,textTransform:"none"}}>(optional — override specific dates)</span>
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                      <div>
                        <label style={{fontSize:9,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:3}}>Date</label>
                        <input type="date" value={ovDate} onChange={e=>setOvDate(e.target.value)}
                          style={{padding:"6px 8px",borderRadius:7,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                      </div>
                      {[["M","AM","#60A5FA",ovM,setOvM],["ME","MID","#5EEAD4",ovME,setOvME],["E","PM","#34D399",ovE,setOvE]].map(([code,label,color,val,setter])=>(
                        <div key={code}>
                          <label style={{fontSize:9,color:color,textTransform:"uppercase",display:"block",marginBottom:3}}>{label}</label>
                          <input type="number" min="0" value={val} onChange={e=>setter(Number(e.target.value))}
                            style={{width:52,padding:"6px 8px",borderRadius:7,border:`1px solid ${color}44`,background:"#FAFBFC",color,fontSize:12,fontFamily:"monospace",fontWeight:700,outline:"none",textAlign:"center"}}/>
                        </div>
                      ))}
                      <div>
                        <label style={{fontSize:9,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:3}}>Budget ฿</label>
                        <input type="number" min="0" value={ovBudget} onChange={e=>setOvBudget(e.target.value)}
                          placeholder="—"
                          style={{width:80,padding:"6px 8px",borderRadius:7,border:"1px solid #F59E0B33",background:"#FAFBFC",color:"#B45309",fontSize:12,fontFamily:"monospace",outline:"none"}}/>
                      </div>
                      <button onClick={()=>{
                        if(!ovDate) return;
                        setFillDateOverrides(p=>({...p,[ovDate]:{needM:ovM,needME:ovME,needE:ovE,...(ovBudget?{budget:Number(ovBudget)}:{})}}));
                        setOvDate(""); setOvM(0); setOvME(0); setOvE(0); setOvBudget("");
                      }} style={{padding:"7px 14px",borderRadius:8,border:"none",background:"#F0FDFA",color:"#0D9488",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",alignSelf:"flex-end"}}>
                        + Add Override
                      </button>
                    </div>
                    {Object.keys(fillDateOverrides).length > 0 && (
                      <div style={{background:"#FAFBFC",borderRadius:10,overflow:"hidden",border:"1px solid #F1F5F9"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                          <thead><tr style={{background:"#F1F5F9"}}>
                            {["Date","In Range","M","ME","E","Budget",""].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#94A3B8",fontWeight:700,fontSize:9,textTransform:"uppercase"}}>{h}</th>)}
                          </tr></thead>
                          <tbody>
                            {Object.entries(fillDateOverrides).sort(([a],[b])=>a.localeCompare(b)).map(([dt,ov])=>{
                              const inRange = dates.some(d=>d.date===dt);
                              return (
                                <tr key={dt} style={{borderBottom:"1px solid #F1F5F9"}}>
                                  <td style={{padding:"6px 10px",fontFamily:"monospace",color:"#1A1D2E",fontWeight:700}}>{dt}</td>
                                  <td style={{padding:"6px 10px"}}>
                                    <span style={{fontSize:9,padding:"2px 7px",borderRadius:5,fontWeight:700,
                                      background:inRange?"#D1FAE5":"#FEE2E2",
                                      color:inRange?"#06C755":"#F87171"}}>
                                      {inRange?"✓ Yes":"✗ Outside range"}
                                    </span>
                                  </td>
                                  <td style={{padding:"6px 10px",color:"#1D4ED8",fontWeight:700}}>{ov.needM}</td>
                                  <td style={{padding:"6px 10px",color:"#0D9488",fontWeight:700}}>{ov.needME}</td>
                                  <td style={{padding:"6px 10px",color:"#065F46",fontWeight:700}}>{ov.needE}</td>
                                  <td style={{padding:"6px 10px",color:"#B45309",fontFamily:"monospace"}}>{ov.budget?`฿${ov.budget.toLocaleString()}`:"—"}</td>
                                  <td style={{padding:"6px 10px"}}>
                                    <button onClick={()=>setFillDateOverrides(p=>{const n={...p};delete n[dt];return n;})}
                                      style={{padding:"2px 8px",border:"none",background:"#FEE2E2",color:"#B91C1C",borderRadius:5,cursor:"pointer",fontSize:10,fontFamily:"inherit"}}>×</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {Object.entries(fillDateOverrides).some(([dt])=>!dates.some(d=>d.date===dt)) && (
                          <div style={{padding:"8px 12px",background:"#FFF5F5",borderTop:"1px solid #F1F5F9",fontSize:10,color:"#B91C1C"}}>
                            — Some override dates are outside the current roster range and won't be applied. Change the month/date range to include them.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Constraint summary */}
                  <div style={{padding:"12px 16px",background:"#F0FDFA",borderRadius:10,border:"1px solid #14B8A633",marginBottom:20,fontSize:11,color:"#475569",lineHeight:1.8}}>
                    <strong style={{color:"#0D9488"}}>Summary: </strong>
                    Each day schedule <strong style={{color:"#1A1D2E"}}>{fillNeedM}M + {fillNeedME}ME + {fillNeedE}E</strong> T1 agents
                    {fillBudget ? <>, budget cap <strong style={{color:"#B45309"}}>฿{Number(fillBudget).toLocaleString()}/day</strong></> : ", no budget cap"}
                    {fillChatCap ? <>, max <strong style={{color:"#065F46"}}>{Number(fillChatCap).toLocaleString()} chats/agent</strong></> : ", no chat limit"}
                    {Object.keys(fillDateOverrides).length>0 ? <>, with <strong style={{color:"#1D4ED8"}}>{Object.keys(fillDateOverrides).length} date override{Object.keys(fillDateOverrides).length>1?"s":""}</strong></> : ""}.
                  </div>

                  {/* Action buttons */}
                  <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                    <button onClick={()=>setFillModal(false)} style={{padding:"10px 20px",borderRadius:9,border:"1px solid #E2E8F0",background:"transparent",color:"#6B7280",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Cancel</button>
                    <button onClick={()=>{
                      const constraints = {
                        needM:        fillNeedM,
                        needME:       fillNeedME,
                        needE:        fillNeedE,
                        dailyBudget:  fillBudget  ? Number(fillBudget)  : null,
                        chatPerAgent: fillChatCap ? Number(fillChatCap) : null,
                        dateOverrides: fillDateOverrides,
                      };
                      // Pass current asgn so fairness math accounts for manual pre-assignments
                      const filled = allocAutoFillConstrained(agents, dates, flags, constraints, brands, fillMode === "fill" ? asgn : {}, monthlyVol, currentMK);

                      if (fillMode === "fill") {
                        // Fill Empty: only write cells that have no existing assignment
                        safeSetAsgn(prev => {
                          const merged = {...prev};
                          Object.entries(filled).forEach(([k, v]) => {
                            if (!prev[k]) merged[k] = v;
                          });
                          return merged;
                        });
                      } else {
                        safeSetAsgn(filled);
                      }
                      setFillModal(false);
                    }} style={{padding:"10px 28px",borderRadius:9,border:"none",background:"#0D9488",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px #14B8A644"}}>
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              {Object.entries(ALLOC_SHIFT_C).map(([k,v])=>(
                <div key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#6B7280"}}>
                  <span style={{display:"inline-block",width:26,height:16,borderRadius:3,background:v.bg,color:v.color,fontWeight:700,fontSize:9,textAlign:"center",lineHeight:"16px"}}>{v.label}</span>
                  {k==="M"?"Morning":k==="ME"?"Mid":k==="E"?"Evening":k==="Off"?"Day Off":k}
                </div>
              ))}
            </div>

            {dates.length===0 ? (
              <div style={{textAlign:"center",padding:48,color:"#94A3B8",fontSize:13}}>
                "No dates in this month."
              </div>
            ) : (
            <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden"}}>
              <div style={{overflowX:"auto",maxHeight:"62vh",overflowY:"auto"}}>
                <table style={{borderCollapse:"collapse",fontFamily:"inherit",fontSize:12}}>
                  <thead>
                    <tr>
                      <th style={{position:"sticky",left:0,zIndex:20,background:"#F1F5F9",minWidth:34,padding:"6px 3px",borderBottom:"1px solid #E2E8F0",borderRight:"1px solid #E2E8F0"}}/>
                      <th style={{position:"sticky",left:34,zIndex:20,background:"#F1F5F9",minWidth:100,padding:"6px 10px",borderBottom:"1px solid #E2E8F0",borderRight:"1px solid #E2E8F0",textAlign:"left",fontSize:10,fontWeight:700,color:"#94A3B8"}}>Name</th>
                      {dates.map(d => {
                        const fl=flags[d.date];const isH=fl?.type==="holiday";const isC=fl?.type==="campaign";
                        return (
                          <th key={d.date} style={{minWidth:CW,maxWidth:CW,padding:"3px 2px",textAlign:"center",borderBottom:"1px solid #E2E8F0",borderRight:"1px solid #F1F5F9",background:hdBg(d),fontWeight:700}}>
                            <div style={{fontSize:8,color:d.isWE||isH?"#F87171":isC?"#5EEAD4":"#94A3B8",fontWeight:700}}>{d.dd}/{d.mm}</div>
                            <div style={{fontSize:10,color:d.isWE||isH?"#F87171":"#475569",fontWeight:600}}>{d.day}</div>
                            {fl && <div style={{fontSize:7,fontWeight:700,color:isH?"#F59E0B":"#5EEAD4",lineHeight:1.1,marginTop:1}}>{fl.label.slice(0,8)}</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {["T1","Return","CC"].map(team => {
                      const ta=rosterAgents.filter(a=>a.team===team);
                      if(!ta.length) return null;
                      const tc=ALLOC_TEAM_C[team];
                      return ta.map((ag,idx) => (
                        <tr key={ag.id}>
                          {idx===0 && (
                            <td rowSpan={ta.length} style={{position:"sticky",left:0,zIndex:10,background:tc.bg,color:tc.color,fontWeight:700,fontSize:10,textAlign:"center",writingMode:"vertical-rl",padding:"6px 3px",minWidth:34,borderBottom:"1px solid #F1F5F9",borderRight:"1px solid #E2E8F0",letterSpacing:".05em"}}>{team}</td>
                          )}
                          <td style={{position:"sticky",left:34,zIndex:10,background:ag.rule?"#FFFBEB":"#FFFFFF",padding:"5px 8px",fontWeight:600,fontSize:11,borderBottom:"1px solid #F1F5F9",borderRight:"1px solid #E2E8F0",whiteSpace:"nowrap"}}>
                            {ag.name}{ag.rule&&<span style={{fontSize:8,color:"#B45309",marginLeft:3}}>★</span>}
                          </td>
                          {dates.map(d => {
                            const k=`${ag.id}_${d.date}`;
                            const val=asgn[k];const cs=val?ALLOC_SHIFT_C[val]:null;
                            const editing=cellKey===k;const avail=ag.days.includes(d.wd);
                            return (
                              <td key={d.date}
                                style={{minWidth:CW,maxWidth:CW,padding:2,textAlign:"center",borderBottom:"1px solid #F1F5F9",borderRight:"1px solid #F1F5F9",background:cBg(d),cursor:isLocked?"default":"pointer",position:"relative",opacity:isLocked?0.85:1}}
                                onClick={()=>{if(isLocked)return;setCellKey(editing?null:k);}}>
                                {cs
                                  ? <div style={{background:cs.bg,color:cs.color,borderRadius:3,padding:"3px 0",fontWeight:700,fontSize:11}}>{cs.label}{extraHrs[k]?.h>0 ? <span style={{marginLeft:3,fontSize:8,background:"#FEF3C7",color:"#B45309",borderRadius:4,padding:"0 3px",verticalAlign:"top"}}>+{extraHrs[k].h}h</span> : null}</div>
                                  : <div style={{color:avail?"#E2E8F0":"#F1F5F9",fontSize:10,padding:"3px 0"}}>{avail?"·":"—"}</div>
                                }
                                {editing && (
                                  <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:"100%",left:0,zIndex:50,background:"#1A1D38",border:"1px solid #E2E8F0",borderRadius:10,boxShadow:"0 8px 24px #00000088",padding:10,width:150,fontSize:12}}>
                                    <div style={{fontWeight:700,color:"#6B7280",marginBottom:6,fontSize:10}}>{d.dd}/{d.mm} {d.day} · {ag.name}</div>
                                    {[...(ag.team==="T1"?ag.shifts:["M","ME","E"].filter(s=>ag.shifts.includes(s))),"Off",...((ag.team==="T2"||ag.team==="Return"||ag.team==="CC")?["TOIL","OT"]:[])].map(code => {
                                      const cs2=ALLOC_SHIFT_C[code];const act=val===code;
                                      return (
                                        <button key={code} onClick={()=>{
                                          // ── Burnout rule: never allow E → M back-to-back ──
                                          // E ends 01:00 → M starts 07:00 = only 6h rest. Hard block.
                                          if (code === "M" || code === "E") {
                                            const dt = new Date(d.date + "T00:00:00Z");
                                            const ymd = (x) => x.toISOString().slice(0,10);
                                            const prevD = new Date(dt); prevD.setUTCDate(dt.getUTCDate()-1);
                                            const nextD = new Date(dt); nextD.setUTCDate(dt.getUTCDate()+1);
                                            const prevShift = asgn[`${ag.id}_${ymd(prevD)}`];
                                            const nextShift = asgn[`${ag.id}_${ymd(nextD)}`];
                                            if (code === "M" && prevShift === "E") {
                                              alert(`Cannot assign Morning to ${ag.name} on ${d.dd}/${d.mm}.\n\n${ag.name} worked Evening yesterday (ends 01:00).\nOnly 6 hours rest before Morning starts 07:00.\n\nThis rule prevents burnout.`);
                                              return;
                                            }
                                            if (code === "E" && nextShift === "M") {
                                              alert(`Cannot assign Evening to ${ag.name} on ${d.dd}/${d.mm}.\n\n${ag.name} is scheduled Morning tomorrow.\nEvening ends 01:00 — only 6 hours rest before next Morning at 07:00.\n\nThis rule prevents burnout.`);
                                              return;
                                            }
                                          }
                                          safeSetAsgn(p=>({...p,[k]:code}));setCellKey(null);
                                        }}
                                          style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"5px 8px",border:act?`2px solid ${cs2?.color}`:"1px solid #E2E8F0",borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:11,background:act?cs2?.bg:"transparent",color:cs2?.color||"#1A1D2E",marginBottom:2}}>
                                          <span style={{width:24,height:16,borderRadius:3,background:cs2?.bg,color:cs2?.color,fontWeight:700,fontSize:9,textAlign:"center",lineHeight:"14px",flexShrink:0}}>{cs2?.label}</span>
                                          {code==="M"?"Morning":code==="ME"?"Mid":code==="E"?"Evening":code==="Off"?"Day Off":code}
                                        </button>
                                      );
                                    })}
                                    {val && <button onClick={()=>{safeSetAsgn(p=>{const n={...p};delete n[k];return n;});setExtraForDate(ag.id, d.date, null);setCellKey(null);}} style={{width:"100%",padding:"4px",border:"1px solid #E2E8F0",borderRadius:5,cursor:"pointer",fontFamily:"inherit",fontSize:10,background:"#FEE2E2",color:"#B91C1C",fontWeight:600,marginTop:2}}>Clear</button>}
                                    {(val==="M"||val==="ME"||val==="E"||val==="OT") && (()=>{
                                      const cur = extraHrs[k] || {h:0, x:1};
                                      const hr = ag.costDay/8;
                                      const chg = (nh,nx)=>setExtraForDate(ag.id, d.date, {h:nh, x:nx});
                                      return (
                                        <div onClick={e=>e.stopPropagation()} style={{borderTop:"1px solid #33364A",marginTop:6,paddingTop:6}}>
                                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                                            <span style={{fontSize:9,color:"#94A3B8",fontWeight:700}}>EXTRA HRS</span>
                                            <button onClick={()=>chg(Math.max(0,(cur.h||0)-1), cur.x||1)} style={{width:20,height:20,padding:0,border:"1px solid #E2E8F0",borderRadius:4,background:"#F1F5F9",color:"#1A1D2E",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit"}}>-</button>
                                            <span style={{fontSize:12,fontWeight:700,color:"#5EEAD4",minWidth:14,textAlign:"center"}}>{cur.h||0}</span>
                                            <button onClick={()=>chg(Math.min(8,(cur.h||0)+1), cur.x||1)} style={{width:20,height:20,padding:0,border:"1px solid #E2E8F0",borderRadius:4,background:"#F1F5F9",color:"#1A1D2E",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"inherit"}}>+</button>
                                            <div style={{marginLeft:"auto",display:"flex",gap:2}}>
                                              {[1,1.5].map(x=>(
                                                <button key={x} onClick={()=>chg(cur.h||0, x)} style={{padding:"2px 6px",border:"1px solid #E2E8F0",borderRadius:4,cursor:"pointer",fontSize:9,fontWeight:700,fontFamily:"inherit",background:(cur.x||1)===x?"#0D9488":"#F1F5F9",color:(cur.x||1)===x?"#fff":"#64748B"}}>{x}x</button>
                                              ))}
                                            </div>
                                          </div>
                                          {(cur.h||0)>0 && <div style={{fontSize:9,color:"#5EEAD4",marginTop:4,fontFamily:"monospace"}}>{"฿"+ag.costDay+" / 8 = ฿"+hr.toFixed(2)+"/hr x "+cur.h+"h x "+(cur.x||1)+" = +฿"+Math.round(hr*(cur.h||0)*(cur.x||1))}</div>}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })}

                    {/* Summary rows */}
                    {rosterTeam==="all" && rosterSearch==="" && [
                      ["Total Working", daySummary.map(s=>s.total), "#EE4D2D", "2px solid #EE4D2D", true],
                      ["Morning",       daySummary.map(s=>s.m),     "#60A5FA", "", false],
                      ["Mid",           daySummary.map(s=>s.me),    "#5EEAD4", "", false],
                      ["Evening",       daySummary.map(s=>s.e),     "#34D399", "", false],
                    ].map(([label,vals,color,bt,bold]) => (
                      <tr key={label} style={{background:"#FAFBFC"}}>
                        <td style={{position:"sticky",left:0,zIndex:10,background:"#FAFBFC",borderRight:"1px solid #E2E8F0",borderTop:bt||"none"}}/>
                        <td style={{position:"sticky",left:34,zIndex:10,background:"#FAFBFC",padding:"4px 8px",fontWeight:700,fontSize:10,color,borderRight:"1px solid #E2E8F0",borderTop:bt||"none"}}>{label}</td>
                        {dates.map((d,i) => (
                          <td key={d.date} style={{minWidth:CW,maxWidth:CW,padding:"3px 2px",textAlign:"center",fontSize:12,fontWeight:bold?800:600,color,background:cBg(d),borderTop:bt||"none",borderRight:"1px solid #F1F5F9",fontFamily:"monospace"}}>{vals[i]}</td>
                        ))}
                      </tr>
                    ))}

                  </tbody>
                </table>
              </div>
            </div>
            )}


            {/* ── Agent Brand Assignment — live from Allocation ── */}
            {(() => {
              const wkldShift = allocShiftF;
              const wkldDate  = dates[Math.min(allocDateIdx, dates.length-1)] || dates[0];
              if (!wkldDate) return null;

              // Show ALL active T1 agents (not just those with a roster assignment)
              const allT1 = agents.filter(a => a.active && a.team === "T1");
              const wkldPool = getWorkingAgents(wkldDate.date, wkldShift);
              const workingIds = new Set(wkldPool.map(a => a.id));

              const agentLoads = allT1.map(ag => {
                const myAssigned = [];
                let totalVol = 0;
                brands.forEach(b => {
                  if (b.offboarded) return; // offboarded brands never show in agent assignment/workload
                  (b.platforms||[]).forEach(plat => {
                    const k = `${b.id}_${wkldDate.date}_${wkldShift}_${plat}`;
                    const raw = brandAsgn[k];
                    const names = [...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
                    if (names.includes(ag.name)) {
                      const vol = Math.round((b.chats?.[plat]||0) / 30 / 2 / Math.max(names.length,1));
                      myAssigned.push({brand:b.name, plat, vol, brandId:b.id});
                      totalVol += vol;
                    }
                  });
                });
                const isWorking = workingIds.has(ag.id);
                const shift = asgn[`${ag.id}_${wkldDate.date}`];
                return {ag, myAssigned, totalVol, isWorking, shift};
              });

              const totalAssigned = agentLoads.reduce((s,r)=>s+r.myAssigned.length,0);
              const totalBrandSlots = brands.reduce((s,b)=>(b.platforms||[]).length>0?s+(b.platforms||[]).length:s,0);

              return (
                <div style={{marginTop:20}}>
                  {/* Header */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1A1D2E"}}>Agent Assigned Brands</div>
                    <div style={{fontSize:11,color:"#94A3B8"}}>{wkldDate.dd}/{wkldDate.mm} {wkldDate.day}</div>
                    {/* Shift toggle */}
                    <div style={{display:"flex",gap:3,background:"#F1F5F9",borderRadius:8,padding:3,marginLeft:4}}>
                      {[["M","AM"],["E","PM"]].map(([s,l])=>(
                        <button key={s} onClick={()=>setAllocShiftF(s)} style={{
                          padding:"4px 12px",border:"none",cursor:"pointer",fontSize:11,fontWeight:600,borderRadius:6,
                          background:wkldShift===s?ALLOC_SHIFT_C[s].bg:"transparent",
                          color:wkldShift===s?ALLOC_SHIFT_C[s].color:"#94A3B8",fontFamily:"inherit"
                        }}>{l}</button>
                      ))}
                    </div>
                    {/* Date nav */}
                    <button onClick={()=>setAllocDateIdx(Math.max(0,allocDateIdx-1))} style={{width:24,height:24,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                    <button onClick={()=>setAllocDateIdx(Math.min(dates.length-1,allocDateIdx+1))} style={{width:24,height:24,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                    {/* Coverage badge */}
                    <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700,
                      background:totalAssigned>=totalBrandSlots?"#D1FAE5":"#FEF3C7",
                      color:totalAssigned>=totalBrandSlots?"#065F46":"#92400E"}}>
                      {totalAssigned}/{totalBrandSlots*2} slots filled
                    </span>
                    <button onClick={()=>setAllocTab("allocation")}
                      style={{padding:"4px 12px",borderRadius:8,border:"1px solid #5EEAD4",background:"#F0FDFA",color:"#0D9488",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>
                      Open Allocation
                    </button>
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
                    {agentLoads.map(({ag, myAssigned, totalVol, isWorking, shift}) => {
                      const sc = shift ? ALLOC_SHIFT_C[shift] : null;
                      return (
                        <div key={ag.id} style={{background:"#FFFFFF",borderRadius:12,padding:"12px 14px",
                          border:`1px solid ${isWorking?ALLOC_SHIFT_C[wkldShift].color+"44":"#E2E8F0"}`,
                          opacity: isWorking ? 1 : 0.55}}>
                          {/* Agent header */}
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontWeight:700,color:"#1A1D2E",fontSize:13}}>{ag.name}</span>
                              {/* Roster shift badge */}
                              {sc
                                ? <span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:sc.bg,color:sc.color,fontWeight:700}}>{sc.label}</span>
                                : <span style={{fontSize:9,padding:"1px 6px",borderRadius:5,background:"#F1F5F9",color:"#94A3B8",fontWeight:700}}>Off</span>
                              }
                            </div>
                            <span style={{fontSize:11,fontWeight:700,
                              color:myAssigned.length>0?ALLOC_SHIFT_C[wkldShift].color:"#94A3B8",
                              background:myAssigned.length>0?ALLOC_SHIFT_C[wkldShift].bg:"#F1F5F9",
                              padding:"2px 7px",borderRadius:6}}>
                              {myAssigned.length} brands
                            </span>
                          </div>

                          {/* Brand list */}
                          {myAssigned.length === 0 ? (
                            <div style={{fontSize:10,color:"#94A3B8",fontStyle:"italic"}}>
                              {isWorking ? "No brands assigned — go to Allocation tab" : "Not scheduled this shift"}
                            </div>
                          ) : (
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              {myAssigned.map(({brand,plat},i) => {
                                const pc=PLATFORM_C[plat];
                                return (
                                  <div key={i} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 0",borderBottom:"1px solid #F1F5F9"}}>
                                    <span style={{fontSize:10,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{brand}</span>
                                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:4,background:pc?.bg,color:pc?.color,fontWeight:700,flexShrink:0}}>{pc?.icon} {plat}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {wkldPool.length === 0 && (
                    <div style={{marginTop:10,padding:"8px 14px",borderRadius:8,background:"#FEF3C7",fontSize:11,color:"#92400E"}}>
                      — No agents are scheduled for {wkldDate.dd}/{wkldDate.mm} {wkldShift==="M"?"Morning":"Evening"} in the roster. Run Auto-Fill or assign shifts manually first.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════
            TEAMS TAB
        ══════════════════════════════════════════ */}
        {allocTab==="payment" && myPayrollAgent && (() => {
          // Payroll period: 24th of prev month → 23rd of current month
          const refDate = new Date(rosterYear, rosterMonth - 1, 1);
          const periodM = refDate.getMonth(); // 0-11
          const periodY = refDate.getFullYear();
          const prevM = periodM === 0 ? 11 : periodM - 1;
          const prevY = periodM === 0 ? periodY - 1 : periodY;
          const periodStart = `${prevY}-${String(prevM+1).padStart(2,"0")}-24`;
          const periodEnd   = `${periodY}-${String(periodM+1).padStart(2,"0")}-23`;
          const periodDates = mkDateRange(periodStart, periodEnd);
          const periodAsgn = {...(allAsgn[periodStart.slice(0,7)]||{}), ...(allAsgn[periodEnd.slice(0,7)]||{})};
          const periodXtra = {...(allExtraHrs[periodStart.slice(0,7)]||{}), ...(allExtraHrs[periodEnd.slice(0,7)]||{})};
          // Tally worked days across BOTH months of the pay period
          let workDays = 0, otDays = 0, extraH = 0, extraPay = 0;
          periodDates.forEach(d => {
            const v = periodAsgn[`${myPayrollAgent.id}_${d.date}`];
            if (!v || v === "Off" || v === "TOIL") return;
            workDays++;
            if (v === "OT") otDays++;
            const e = periodXtra[`${myPayrollAgent.id}_${d.date}`];
            if (e && e.h) { extraH += e.h; extraPay += e.h * (myPayrollAgent.costDay/8) * (e.x || 1); }
          });
          const normalDays = workDays - otDays;
          const subtotal = normalDays * myPayrollAgent.costDay + otDays * myPayrollAgent.costDay * 1.5 + extraPay;
          const withholding = subtotal * WITHHOLDING_RATE;
          const netAmount = subtotal - withholding;
          const invoiceMonthLabel = THAI_MONTHS[periodM];
          const invoiceMonthAbbr = THAI_MONTH_ABBR[periodM];
          const thaiYear = periodY + 543;
          const thaiYearShort = String(thaiYear).slice(-2);
          const invoiceNumber = `${periodY}${String(periodM+1).padStart(2,"0")}${myPayrollAgent.id.replace(/\D/g,"").slice(-2)}`;
          const invoiceDate = `${new Date(periodY, periodM+1, 0).getDate()}-${invoiceMonthAbbr}-${thaiYearShort}`;
          // E-sign check: today >= 19th of the current invoice month
          const today = new Date();
          const signDay = new Date(periodY, periodM, 19);
          const isSignWindow = today >= signDay;
          const signatureKey = `${periodY}-${String(periodM+1).padStart(2,"0")}`;
          const signature = (myPayrollAgent.signatures || {})[signatureKey];

          const handleSign = () => {
            setSignPadContext({ agentId: myPayrollAgent.id, signatureKey });
            setSignPadOpen(true);
            // Defer canvas initialization until the modal renders
            setTimeout(() => {
              const c = signCanvasRef.current;
              if (!c) return;
              const ctx = c.getContext("2d");
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, c.width, c.height);
              ctx.strokeStyle = "#0D9488";
              ctx.lineWidth = 2.5;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
            }, 50);
          };

          const printInvoice = () => {
            const w = window.open("", "_blank", "width=900,height=1200");
            if (!w) { alert("Allow pop-ups to print"); return; }
            const fmtBaht = n => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            w.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invoiceNumber}</title>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                *{box-sizing:border-box;margin:0;padding:0;font-family:'Sarabun',sans-serif}
                body{padding:30px 40px;font-size:13px;color:#000}
                .row{display:grid;grid-template-columns:170px 1fr;gap:8px;margin-bottom:4px}
                .row b{font-weight:700}
                .center{text-align:center;font-size:18px;font-weight:700;padding:10px 0;border:1px solid #000;margin:18px 0}
                table{width:100%;border-collapse:collapse;margin-top:8px}
                table th,table td{border:1px solid #000;padding:8px 10px;vertical-align:top}
                table th{background:#fafafa;font-weight:700;font-size:12px}
                .total-line{display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:6px 10px;font-weight:700;border-top:1px solid #000}
                .pay-section{margin-top:24px}
                .pay-section h3{font-size:13px;font-weight:700;text-decoration:underline;margin-bottom:6px}
                .signature{margin-top:40px;padding-top:16px;border-top:1px dashed #ccc;font-size:11px;color:#666}
                @media print{@page{size:A4;margin:15mm}}
              </style></head><body>
              <div class="row"><div>เลขประจำตัวผู้เสียภาษี</div><div>${myPayrollAgent.taxId || "—"}</div></div>
              <div class="row"><div>ชื่อ</div><div>${myPayrollAgent.thaiName || myPayrollAgent.fullName || myPayrollAgent.name}</div></div>
              <div class="row"><div>ที่อยู่จัดส่งเอกสาร</div><div>${myPayrollAgent.docDeliveryAddress || myPayrollAgent.idCardAddress || "—"}</div></div>
              <div class="row"><div>ที่อยู่ตามหน้าบัตร</div><div>${myPayrollAgent.idCardAddress || "—"}</div></div>
              <div class="center">ใบแจ้งหนี้</div>
              <div class="row"><div>เลขประจำตัวผู้เสียภาษี</div><div>${COMPANY_INFO.taxId}</div></div>
              <div class="row"><div>นามลูกค้า</div><div>${COMPANY_INFO.name}</div></div>
              <div class="row" style="margin-bottom:10px"><div>ที่อยู่</div><div>${COMPANY_INFO.address}</div></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:8px">
                <div><b>เลขที่ :</b> ${invoiceNumber}</div>
                <div style="text-align:right"><b>วันที่ :</b> ${invoiceDate}</div>
              </div>
              <table>
                <thead><tr><th>รายการ</th><th style="text-align:right;width:160px">จำนวนเงิน (บาท)</th></tr></thead>
                <tbody>
                  <tr><td>ค่าบริการตอบแชทช่วงเดือน ${invoiceMonthLabel} ${thaiYear}</td><td style="text-align:right;font-family:monospace">${fmtBaht(subtotal)}</td></tr>
                  <tr><td style="text-align:right;font-weight:700">รวม</td><td style="text-align:right;font-weight:700;font-family:monospace">${fmtBaht(subtotal)}</td></tr>
                </tbody>
              </table>
              <div style="margin-top:18px;display:grid;grid-template-columns:170px 100px 70px;gap:6px;font-size:13px">
                <div>จำนวนเงินที่ได้รับ</div><div style="text-align:right;font-family:monospace">${fmtBaht(netAmount)}</div><div>บาท</div>
                <div>ภาษีหัก ณ ที่จ่าย 3%</div><div style="text-align:right;font-family:monospace">${fmtBaht(withholding)}</div><div>บาท</div>
              </div>
              <div class="pay-section">
                <h3>ช่องทางการชำระเงิน</h3>
                <div class="row"><div>ธนาคาร</div><div>${myPayrollAgent.bankName || "—"}</div></div>
                <div class="row"><div>ชื่อบัญชี</div><div>${myPayrollAgent.bankAccountName || myPayrollAgent.thaiName || "—"}</div></div>
                <div class="row"><div>เลขที่บัญชี</div><div>${myPayrollAgent.bankAccount || "—"}</div></div>
              </div>
              <div style="margin-top:50px;text-align:center">
                <div style="display:inline-block;text-align:center">
                  <div style="border-bottom:1px solid #000;width:280px;height:80px;margin-bottom:6px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px">
                    ${signature && signature.dataUrl ? `<img src="${signature.dataUrl}" style="max-height:74px;max-width:270px"/>` : signature && signature.name ? `<div style="font-family:'Sarabun',cursive;font-size:18px;font-weight:700;color:#1a1d2e;font-style:italic">${signature.name}</div>` : ""}
                  </div>
                  <div style="font-size:11px;font-weight:700">eSign</div>
                  ${signature ? `<div style="font-size:9px;color:#0D9488;margin-top:3px">✓ ลงนามอิเล็กทรอนิกส์ผ่านระบบ NiRM</div>` : `<div style="font-size:9px;color:#aaa;margin-top:3px">(ยังไม่ได้ลงนาม)</div>`}
                </div>
              </div>
              ${myPayrollAgent.idCardPhotoUrl ? `
                <div style="page-break-before:always;padding-top:40px">
                  <h2 style="font-size:14px;font-weight:700;margin-bottom:10px;text-align:center">สำเนาบัตรประชาชน / ID Card</h2>
                  <div style="text-align:center"><img src="${myPayrollAgent.idCardPhotoUrl}" style="max-width:100%;max-height:600px;border:1px solid #ccc" crossorigin="anonymous"/></div>
                </div>
              ` : ""}
              ${myPayrollAgent.bookbankPhotoUrl ? `
                <div style="page-break-before:always;padding-top:40px">
                  <h2 style="font-size:14px;font-weight:700;margin-bottom:10px;text-align:center">สำเนาสมุดบัญชี / Bookbank</h2>
                  <div style="text-align:center"><img src="${myPayrollAgent.bookbankPhotoUrl}" style="max-width:100%;max-height:600px;border:1px solid #ccc" crossorigin="anonymous"/></div>
                </div>
              ` : ""}
              <script>
                // Wait for ALL images (including ID card + Bookbank from Supabase) to fully load before printing
                window.onload = () => {
                  const imgs = Array.from(document.images);
                  if (imgs.length === 0) { setTimeout(()=>window.print(), 300); return; }
                  let loaded = 0;
                  const tryPrint = () => { if (++loaded >= imgs.length) setTimeout(()=>window.print(), 400); };
                  imgs.forEach(img => { if (img.complete) tryPrint(); else { img.onload = tryPrint; img.onerror = tryPrint; } });
                };
              <\/script>
              </body></html>`);
            w.document.close();
          };

          const completeness = (() => {
            const f = myPayrollAgent;
            const fields = [f.taxId, f.thaiName || f.fullName, f.idCardAddress, f.bankName, f.bankAccount, f.bankAccountName];
            const filled = fields.filter(Boolean).length;
            return { filled, total: fields.length, pct: Math.round(filled/fields.length*100) };
          })();

          return (
            <div style={{marginTop:18,background:"#FFFFFF",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden"}}>
              <div style={{padding:"14px 18px",borderBottom:"1px solid #F1F5F9",background:"#F8FAFC",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#1A1D2E"}}>My Invoice — {invoiceMonthLabel} {thaiYear}</div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Period 24 {THAI_MONTH_ABBR[prevM]} – 23 {THAI_MONTH_ABBR[periodM]} · {workDays} working days</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {signature ? (
                    <div style={{padding:"6px 12px",borderRadius:7,background:"#D1FAE5",border:"1px solid #6EE7B7",fontSize:11,color:"#065F46",fontWeight:600}}>
                      ✓ Signed by {signature.name}
                    </div>
                  ) : isSignWindow ? (
                    <button onClick={completeness.filled === completeness.total ? handleSign : ()=>alert("Please complete your personal info first ("+completeness.filled+"/"+completeness.total+" fields filled)")}
                      style={{padding:"7px 14px",borderRadius:8,border:"none",background:completeness.filled === completeness.total?"#F59E0B":"#E2E8F0",color:completeness.filled === completeness.total?"#fff":"#94A3B8",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      ✍ Sign Invoice
                    </button>
                  ) : (
                    <div style={{padding:"6px 12px",borderRadius:7,background:"#F1F5F9",fontSize:11,color:"#94A3B8"}}>
                      Sign window opens on {invoiceMonthAbbr} 19
                    </div>
                  )}
                  <button onClick={printInvoice}
                    style={{padding:"7px 12px",borderRadius:8,border:"1px solid #F87171",background:"#FFF5F5",color:"#B91C1C",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    Print / PDF
                  </button>
                </div>
              </div>
              {completeness.filled < completeness.total && (
                <div style={{padding:"10px 18px",background:"#FEF3C7",borderBottom:"1px solid #FDE68A",fontSize:11,color:"#92400E"}}>
                  ⚠️ Your personal information is incomplete ({completeness.filled}/{completeness.total} fields). The invoice may not print correctly. <a href="#" onClick={(e)=>{
                    e.preventDefault();
                    // FIX: open the modal directly via state instead of a
                    // full-page reload to `?invite=...`. The redirect approach
                    // depended on a useEffect[storageLoaded] firing after the
                    // reload, which could miss the param if the navigation
                    // didn't refresh the page (same-origin same-path edge),
                    // and it cleared the user's current scroll/tab context.
                    if (!myPayrollAgent) return;
                    setInviteFormAgentId(myPayrollAgent.id);
                    setInviteFormData(d => ({
                      ...d,
                      fullName:        myPayrollAgent.fullName || myPayrollAgent.name || "",
                      thaiName:        myPayrollAgent.thaiName || "",
                      phone:           myPayrollAgent.phone || "",
                      idCard:          myPayrollAgent.idCard || "",
                      taxId:           myPayrollAgent.taxId || "",
                      idCardAddress:   myPayrollAgent.idCardAddress || "",
                      docDeliveryAddress: myPayrollAgent.docDeliveryAddress || "",
                      sameAddress:     !myPayrollAgent.docDeliveryAddress || myPayrollAgent.docDeliveryAddress === myPayrollAgent.idCardAddress,
                      bankName:        myPayrollAgent.bankName || "",
                      bankAccount:     myPayrollAgent.bankAccount || "",
                      bankAccountName: myPayrollAgent.bankAccountName || "",
                      startDate:       myPayrollAgent.startDate || "",
                      costDay:         myPayrollAgent.costDay || "",
                      profilePhotoUrl: myPayrollAgent.profilePhotoUrl || "",
                      idCardPhotoUrl:  myPayrollAgent.idCardPhotoUrl || "",
                      bookbankPhotoUrl: myPayrollAgent.bookbankPhotoUrl || "",
                    }));
                    setInviteFormModal(true);
                  }} style={{color:"#92400E",textDecoration:"underline",fontWeight:700,cursor:"pointer"}}>Fill it now</a>
                </div>
              )}
              <div style={{padding:"20px 24px",fontSize:12,fontFamily:"'Sarabun',sans-serif"}}>
                {/* Agent header */}
                <div style={{display:"grid",gridTemplateColumns:"170px 1fr",gap:4,fontSize:12,marginBottom:14}}>
                  <div style={{fontWeight:700}}>เลขประจำตัวผู้เสียภาษี</div><div>{myPayrollAgent.taxId || <span style={{color:"#CBD5E1"}}>— ยังไม่ได้กรอก —</span>}</div>
                  <div style={{fontWeight:700}}>ชื่อ</div><div>{myPayrollAgent.thaiName || myPayrollAgent.fullName || myPayrollAgent.name}</div>
                  <div style={{fontWeight:700}}>ที่อยู่จัดส่งเอกสาร</div><div>{myPayrollAgent.docDeliveryAddress || myPayrollAgent.idCardAddress || <span style={{color:"#CBD5E1"}}>— ยังไม่ได้กรอก —</span>}</div>
                  <div style={{fontWeight:700}}>ที่อยู่ตามหน้าบัตร</div><div>{myPayrollAgent.idCardAddress || <span style={{color:"#CBD5E1"}}>— ยังไม่ได้กรอก —</span>}</div>
                </div>
                <div style={{textAlign:"center",border:"1px solid #1A1D2E",padding:"8px 0",fontWeight:700,fontSize:16,marginBottom:14}}>ใบแจ้งหนี้</div>
                <div style={{display:"grid",gridTemplateColumns:"170px 1fr",gap:4,fontSize:12,marginBottom:8}}>
                  <div style={{fontWeight:700}}>เลขประจำตัวผู้เสียภาษี</div><div>{COMPANY_INFO.taxId}</div>
                  <div style={{fontWeight:700}}>นามลูกค้า</div><div>{COMPANY_INFO.name}</div>
                  <div style={{fontWeight:700}}>ที่อยู่</div><div>{COMPANY_INFO.address}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,fontSize:12,marginBottom:14}}>
                  <div><b>เลขที่ :</b> {invoiceNumber}</div>
                  <div style={{textAlign:"right"}}><b>วันที่ :</b> {invoiceDate}</div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:14}}>
                  <thead><tr style={{background:"#FAFAFA"}}>
                    <th style={{border:"1px solid #1A1D2E",padding:"8px 10px",textAlign:"left",fontWeight:700}}>รายการ</th>
                    <th style={{border:"1px solid #1A1D2E",padding:"8px 10px",textAlign:"right",fontWeight:700,width:160}}>จำนวนเงิน (บาท)</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td style={{border:"1px solid #1A1D2E",padding:"8px 10px"}}>ค่าบริการตอบแชทช่วงเดือน {invoiceMonthLabel} {thaiYear}</td>
                      <td style={{border:"1px solid #1A1D2E",padding:"8px 10px",textAlign:"right",fontFamily:"monospace"}}>{subtotal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    </tr>
                    <tr>
                      <td style={{border:"1px solid #1A1D2E",padding:"8px 10px",textAlign:"right",fontWeight:700}}>รวม</td>
                      <td style={{border:"1px solid #1A1D2E",padding:"8px 10px",textAlign:"right",fontWeight:700,fontFamily:"monospace"}}>{subtotal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"170px 100px 70px",gap:6,fontSize:12,marginBottom:18}}>
                  <div>จำนวนเงินที่ได้รับ</div><div style={{textAlign:"right",fontFamily:"monospace"}}>{netAmount.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div>บาท</div>
                  <div>ภาษีหัก ณ ที่จ่าย 3%</div><div style={{textAlign:"right",fontFamily:"monospace"}}>{withholding.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div>บาท</div>
                </div>
                <div>
                  <div style={{fontWeight:700,textDecoration:"underline",fontSize:12,marginBottom:6}}>ช่องทางการชำระเงิน</div>
                  <div style={{display:"grid",gridTemplateColumns:"170px 1fr",gap:4,fontSize:12}}>
                    <div>ธนาคาร / Bank</div><div>{myPayrollAgent.bankName || <span style={{color:"#CBD5E1"}}>—</span>}</div>
                    <div>ชื่อบัญชี / Account Name</div><div>{myPayrollAgent.bankAccountName || myPayrollAgent.thaiName || <span style={{color:"#CBD5E1"}}>—</span>}</div>
                    <div>เลขที่บัญชี / Account No.</div><div>{myPayrollAgent.bankAccount || <span style={{color:"#CBD5E1"}}>—</span>}</div>
                  </div>
                </div>
                <div style={{marginTop:30,paddingTop:20,borderTop:"1px dashed #CBD5E1",display:"flex",justifyContent:"center"}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{borderBottom:"1px solid #1A1D2E",width:300,height:80,marginBottom:6,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:2}}>
                      {signature && signature.dataUrl
                        ? <img src={signature.dataUrl} alt="eSign" style={{maxHeight:74,maxWidth:290}}/>
                        : signature && signature.name
                        ? <div style={{fontSize:18,fontWeight:700,color:"#0D9488",fontStyle:"italic"}}>{signature.name}</div>
                        : null}
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:"#1A1D2E"}}>eSign</div>
                    {signature
                      ? <div style={{fontSize:9,color:"#0D9488",marginTop:3}}>✓ ลงนามอิเล็กทรอนิกส์ผ่านระบบ NiRM</div>
                      : <div style={{fontSize:9,color:"#CBD5E1",marginTop:3}}>(ยังไม่ได้ลงนาม)</div>}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

                {allocTab==="agents" && (
          <div>
            <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,minWidth:160}}>
                <Search size={12} color="#94A3B8" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)"}}/>
                <input value={agentSearch} onChange={e=>setAgentSearch(e.target.value)} placeholder="Search agent…"
                  style={{...inpS,paddingLeft:28,width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                {[["all","All"],["T2","T2"],["T1","T1"],["Return","Return"],["CC","CC"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setAgentTeamF(v)} style={{
                    padding:"6px 12px",borderRadius:8,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",
                    background:agentTeamF===v?(v==="all"?"#14B8A6":ALLOC_TEAM_C[v]?.bg||"#F0FDFA"):"#F1F5F9",
                    color:agentTeamF===v?(v==="all"?"#fff":ALLOC_TEAM_C[v]?.color||"#5EEAD4"):"#6B7280",
                  }}>{l}</button>
                ))}
              </div>
              {role==="manager" && <button onClick={()=>{
                // FIX (data-loss bug): previously generated id as `A${agents.length+1}` which
                // collided with seeded agent "Prim" at A16 when agents.length===15 — saveAgent's
                // findIndex matched A16 and OVERWROTE Prim instead of appending the new staff.
                // Now compute the next id from the highest existing numeric suffix +1.
                const nums = agents.map(a => parseInt(String(a.id||"").replace(/^A/,""),10)).filter(n => !isNaN(n));
                const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
                let nextId = `A${String(nextNum).padStart(2,"0")}`;
                // Belt-and-suspenders: if somehow still colliding, bump until unique.
                while (agents.some(a => a.id === nextId)) {
                  nextId = `A${String(parseInt(nextId.slice(1),10)+1).padStart(2,"0")}`;
                }
                setEditAgent({id:nextId,name:"",email:"",team:"T1",active:true,shifts:["M"],days:[...ALLOC_ALL],costDay:400,rule:"",_isNew:true});
                setAgentModal(true);
              }}
                style={{padding:"8px 16px",borderRadius:9,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>
                + Add Agent
              </button>}
            </div>

            {/* T2 — Total Monthly Cost Input */}
            {(agentTeamF==="all"||agentTeamF==="T2") && (
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:8,background:"#DBEAFE",color:"#1D4ED8",fontWeight:700}}>T2</span>
                  <span style={{fontSize:13,fontWeight:600,color:"#1A1D2E"}}>Fulltime Monthly Cost</span>
                </div>
                <div style={{background:"#fff",borderRadius:12,border:"1px solid #E2E8F0",padding:16,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:200}}>
                    <label style={{fontSize:11,fontWeight:600,color:"#64748B",display:"block",marginBottom:6}}>
                      Total T2 salary — {MONTHS[rosterMonth-1]} {rosterYear} (฿)
                    </label>
                    <div style={{position:"relative"}}>
                      <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#94A3B8",fontWeight:700}}>฿</span>
                      <input type="number" min="0"
                        value={(fulltimeSalary && fulltimeSalary[currentMK]) || ""}
                        placeholder="e.g. 171730" disabled={!canEdit} title={canEdit?"":"Sign in as manager to edit"}
                        onChange={e=>{
                          const n = Number(e.target.value) || 0;
                          if (canEdit) setFulltimeSalary(prev => ({ ...(prev||{}), [currentMK]: n }));
                        }}
                        style={{width:"100%",padding:"10px 10px 10px 28px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F8FAFC",color:"#1D4ED8",fontSize:15,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                    </div>
                    <div style={{fontSize:10,color:"#94A3B8",marginTop:6}}>
                      Each month has its own value. Switch month at the top to enter a different month's salary.
                    </div>
                  </div>
                  <div style={{textAlign:"center",minWidth:120}}>
                    <div style={{fontSize:10,color:"#94A3B8",marginBottom:4}}>Daily share ({dates.length} days)</div>
                    <div style={{fontFamily:"monospace",fontWeight:700,fontSize:14,color:"#0D9488"}}>฿{Math.round(t2DailyShare).toLocaleString()}</div>
                  </div>
                  <div style={{fontSize:10,color:"#94A3B8",maxWidth:200}}>This amount is added to T1 costs daily and used in cost-per-chat calculation.</div>
                </div>
              </div>
            )}

            {/* T1 + Return */}
            {(agentTeamF==="all"||agentTeamF==="T1"||agentTeamF==="Return"||agentTeamF==="CC") && (() => {
              const teams=agentTeamF==="all"?["T1","Return","CC"]:[agentTeamF];
              const t1rList=agents.filter(a=>teams.includes(a.team)&&(agentSearch===""||a.name.toLowerCase().includes(agentSearch.toLowerCase()))).sort((a,b)=>(a.id||"").localeCompare(b.id||"",undefined,{numeric:true}));
              if(!t1rList.length) return null;
              const t1rTotal=t1rList.filter(a=>a.active).reduce((s,a)=>{let d=0;dates.forEach(dt=>{const v=asgn[`${a.id}_${dt.date}`];if(v&&v!=="Off")d++;});return s+d*a.costDay;},0);
              return (
                <div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      {(agentTeamF==="all"||agentTeamF==="T1")&&<span style={{fontSize:11,padding:"3px 10px",borderRadius:8,background:"#14b8a622",color:"#0D9488",fontWeight:700}}>T1</span>}
                      {(agentTeamF==="all"||agentTeamF==="Return")&&<span style={{fontSize:11,padding:"3px 10px",borderRadius:8,background:"#FEE2E2",color:"#B91C1C",fontWeight:700}}>Return</span>}
                      <span style={{fontSize:13,fontWeight:700,color:"#1A1D2E"}}>Cost per Day — Actual Worked Days</span>
                    </div>
                    <div style={{fontFamily:"monospace",fontSize:15,fontWeight:700,color:"#0D9488"}}>฿{t1rTotal.toLocaleString()} this period</div>
                  </div>
                  <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#F1F5F9"}}>
                        {["PCode","Name","Full Name","Shifts","Days","Cost/Day","Days Worked","Period Cost","Status",""].map(h=>(
                          <th key={h} style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {t1rList.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true})).map((a,idx) => {
                          let dw=0; dates.forEach(dt=>{const v=asgn[`${a.id}_${dt.date}`];if(v&&v!=="Off")dw++;});
                          const pc=dw*a.costDay;
                          const prof = userProfiles[(a.name||"").toLowerCase()] || {};
                          return (
                            <tr key={a.id} style={{borderBottom:"1px solid #F1F5F9",cursor:"pointer",opacity:a.active?1:0.5}} onClick={()=>openAgent(a)}>
                              <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:ALLOC_TEAM_C[a.team]?.bg,color:ALLOC_TEAM_C[a.team]?.color,fontWeight:700,fontFamily:"monospace"}}>{a.id}</span></td>
                              <td style={{padding:"8px 12px",fontWeight:600,color:"#1A1D2E"}}>{a.name}</td>
                              <td style={{padding:"8px 12px",fontSize:11,color:"#64748B"}}>{prof.fullName||a.fullName||a.thaiName||""}</td>
                              <td style={{padding:"8px 12px"}}><div style={{display:"flex",gap:3}}>{a.shifts.map(s=><span key={s} style={{fontSize:10,padding:"2px 6px",borderRadius:6,background:ALLOC_SHIFT_C[s]?.bg,color:ALLOC_SHIFT_C[s]?.color,fontWeight:700}}>{s}</span>)}</div></td>
                              <td style={{padding:"8px 12px"}}><div style={{display:"flex",gap:2}}>{ALLOC_DAYS.map(dy=>{const on=a.days.includes(dy.wd);return(<span key={dy.code} style={{display:"inline-flex",width:22,height:18,borderRadius:3,fontSize:8,fontWeight:700,alignItems:"center",justifyContent:"center",background:on?"#DBEAFE":"#F1F5F9",color:on?"#60A5FA":"#94A3B8"}}>{dy.code.slice(0,2)}</span>);})}</div></td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:11,color:"#94A3B8"}}>฿{a.costDay}</td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:12,fontWeight:700,color:dw>0?"#1A1D2E":"#94A3B8"}}>{dw}d</td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:13,fontWeight:700,color:ALLOC_TEAM_C[a.team]?.color}}>฿{pc.toLocaleString()}</td>
                              <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:a.active?"#D1FAE5":"#94A3B822",color:a.active?"#06C755":"#6B7280",fontWeight:700}}>{a.active?"Active":"Off"}</span></td>
                              <td style={{padding:"8px 12px"}}><button onClick={e=>{e.stopPropagation();openAgent(a);}} style={{padding:"3px 10px",borderRadius:7,border:"none",background:"transparent",color:"#0D9488",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Edit</button></td>
                            </tr>
                          );
                        })}
                        <tr style={{background:"#14b8a611",borderTop:"2px solid #5EEAD4"}}>
                          <td colSpan={7} style={{padding:"8px 12px",fontWeight:700,color:"#0D9488",fontSize:11}}>T1 + RETURN + CC TOTAL ({t1rList.filter(a=>a.active).length} active)</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:14,fontWeight:700,color:"#0D9488"}}>฿{t1rTotal.toLocaleString()}</td>
                          <td colSpan={2}/>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Agent modal */}
            {agentModal && editAgent && (
              <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onClick={()=>setAgentModal(false)}>
                <div style={{background:"#FFFFFF",borderRadius:16,border:"1px solid #E2E8F0",padding:24,width:520,maxWidth:"92vw",maxHeight:"90vh",overflow:"auto",boxShadow:"0 16px 48px #00000088"}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
                    <div style={{fontSize:15,fontWeight:700}}>{editAgent.name||"New Agent"}</div>
                    <button onClick={()=>setAgentModal(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6B7280",fontSize:18}}>×</button>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <div style={{display:"grid",gridTemplateColumns:"110px 1fr 1fr",gap:12}}>
                      <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>PCode</label>
                        {/* PCode is editable per user request. saveAgent below
                            still checks for collisions against OTHER agents and
                            rejects the save if you try to use an id that's
                            already taken — so renaming yourself to a unique
                            new code is fine but you can't overwrite someone. */}
                        <input value={editAgent.id} onChange={e=>setEditAgent({...editAgent, id: e.target.value.toUpperCase().trim()})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/></div>
                      <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Name</label>
                        <input value={editAgent.name} onChange={e=>setEditAgent({...editAgent,name:e.target.value})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                      <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Team</label>
                        <select value={editAgent.team} onChange={e=>setEditAgent({...editAgent,team:e.target.value})}
                          style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none"}}>
                          <option>T1</option><option>T2</option><option>Return</option><option>CC</option>
                        </select></div>
                    </div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Email (links to login)</label>
                      <input type="email" value={editAgent.email||""} onChange={e=>setEditAgent({...editAgent,email:e.target.value})}
                        placeholder="e.g. someone@crea.asia"
                        style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                      <div style={{fontSize:10,color:"#94A3B8",marginTop:4}}>When this agent signs in with this email, they see their own schedule only.</div></div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Cost / Day (฿){role!=="manager"&&<span style={{marginLeft:6,color:"#94A3B8",fontWeight:500,textTransform:"none"}}>(read-only)</span>}</label>
                      <input type="number" value={editAgent.costDay} readOnly={role!=="manager"} onChange={e=>{if(role==="manager")setEditAgent({...editAgent,costDay:Number(e.target.value)})}}
                        style={{padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:role!=="manager"?"#F1F5F9":"#FAFBFC",color:role!=="manager"?"#64748B":"#1A1D2E",fontSize:13,fontFamily:"monospace",outline:"none",cursor:role!=="manager"?"not-allowed":"text"}}/></div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:6}}>Shifts</label>
                      <div style={{display:"flex",gap:6}}>{ALLOC_SHIFTS.map(s=>{const on=editAgent.shifts.includes(s.code);const cs=ALLOC_SHIFT_C[s.code];return(
                        <button key={s.code} onClick={()=>{const sh=on?editAgent.shifts.filter(x=>x!==s.code):[...editAgent.shifts,s.code];setEditAgent({...editAgent,shifts:sh});}}
                          style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:6,border:on?`2px solid ${cs.color}`:"1px solid #E2E8F0",background:on?cs.bg:"transparent",color:on?cs.color:"#6B7280",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                          <span style={{width:22,height:14,borderRadius:3,background:cs.bg,color:cs.color,fontWeight:700,fontSize:9,textAlign:"center",lineHeight:"14px"}}>{cs.label}</span>{s.label}
                        </button>);})}</div></div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:6}}>Available Days</label>
                      <div style={{display:"flex",gap:4}}>{ALLOC_DAYS.map(dy=>{const on=editAgent.days.includes(dy.wd);const we=dy.wd===0||dy.wd===6;return(
                        <button key={dy.code} onClick={()=>{const days=on?editAgent.days.filter(x=>x!==dy.wd):[...editAgent.days,dy.wd];setEditAgent({...editAgent,days});}}
                          style={{width:40,height:34,borderRadius:6,border:on?`2px solid ${we?"#EE4D2D":"#14B8A6"}`:"1px solid #E2E8F0",background:on?(we?"#FEE2E2":"#F0FDFA"):"transparent",color:on?(we?"#F87171":"#5EEAD4"):"#94A3B8",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                          {dy.code}</button>);})}
                      </div>
                      <div style={{display:"flex",gap:6,marginTop:6}}>
                        <button onClick={()=>setEditAgent({...editAgent,days:[...ALLOC_WK]})} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#6B7280",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>Mon–Fri</button>
                        <button onClick={()=>setEditAgent({...editAgent,days:[...ALLOC_ALL]})} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#6B7280",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>All Days</button>
                      </div></div>
                    <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Special Rule</label>
                      <input value={editAgent.rule} onChange={e=>setEditAgent({...editAgent,rule:e.target.value})}
                        style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                    <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13,cursor:"pointer",color:"#475569"}}>
                      <input type="checkbox" checked={editAgent.active} onChange={e=>setEditAgent({...editAgent,active:e.target.checked})} style={{width:16,height:16}}/> Active
                    </label>

                    {/* ── Personal Info (filled by agent via invite link) ── */}
                    {(editAgent.bankAccount || editAgent.taxId || editAgent.profilePhotoUrl) && (
                      <div style={{background:"#F0FDF4",borderRadius:10,border:"1px solid #BBF7D0",padding:"14px 16px"}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#065F46",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span>Personal Info Received / ข้อมูลที่ได้รับ</span>
                          <span style={{fontSize:10,padding:"1px 8px",borderRadius:4,background:"#fff",color:"#0D9488",fontFamily:"monospace",fontWeight:700}}>PCode: {editAgent.id}</span>
                        </div>
                        <div style={{display:"flex",gap:14,marginBottom:10}}>
                          {editAgent.profilePhotoUrl && (
                            <img src={editAgent.profilePhotoUrl} alt="" style={{width:72,height:72,borderRadius:12,objectFit:"cover",border:"1px solid #BBF7D0"}}/>
                          )}
                          <div style={{flex:1,fontSize:11,color:"#475569",display:"grid",gridTemplateColumns:"1fr",gap:3}}>
                            {(editAgent.thaiName || editAgent.fullName) && <div><span style={{color:"#94A3B8"}}>Name: </span>{editAgent.thaiName || editAgent.fullName}</div>}
                            {editAgent.phone && <div><span style={{color:"#94A3B8"}}>Phone: </span>{editAgent.phone}</div>}
                            {editAgent.idCard && <div><span style={{color:"#94A3B8"}}>ID Card: </span>{editAgent.idCard}</div>}
                            {editAgent.taxId && <div><span style={{color:"#94A3B8"}}>Tax ID: </span>{editAgent.taxId}</div>}
                            {editAgent.startDate && <div><span style={{color:"#94A3B8"}}>Start: </span>{editAgent.startDate}</div>}
                          </div>
                        </div>
                        {(editAgent.idCardAddress || editAgent.docDeliveryAddress) && (
                          <div style={{fontSize:11,color:"#475569",marginBottom:10,paddingTop:8,borderTop:"1px solid #BBF7D0"}}>
                            {editAgent.idCardAddress && <div style={{marginBottom:3}}><span style={{color:"#94A3B8"}}>ที่อยู่ตามบัตร: </span>{editAgent.idCardAddress}</div>}
                            {editAgent.docDeliveryAddress && editAgent.docDeliveryAddress !== editAgent.idCardAddress && <div><span style={{color:"#94A3B8"}}>ที่อยู่จัดส่ง: </span>{editAgent.docDeliveryAddress}</div>}
                          </div>
                        )}
                        {(editAgent.bankName || editAgent.bankAccount) && (
                          <div style={{fontSize:11,color:"#475569",paddingTop:8,borderTop:"1px solid #BBF7D0"}}>
                            <div style={{fontWeight:700,color:"#065F46",marginBottom:3}}>Bank / ธนาคาร</div>
                            {editAgent.bankName && <div><span style={{color:"#94A3B8"}}>Bank: </span>{editAgent.bankName}</div>}
                            {editAgent.bankAccountName && <div><span style={{color:"#94A3B8"}}>Acc Name: </span>{editAgent.bankAccountName}</div>}
                            {editAgent.bankAccount && <div><span style={{color:"#94A3B8"}}>Account: </span>{editAgent.bankAccount}</div>}
                          </div>
                        )}
                        {(editAgent.idCardPhotoUrl || editAgent.bookbankPhotoUrl) && (
                          <div style={{display:"flex",gap:10,marginTop:10,paddingTop:8,borderTop:"1px solid #BBF7D0"}}>
                            {editAgent.idCardPhotoUrl && (
                              <a href={editAgent.idCardPhotoUrl} target="_blank" rel="noreferrer" style={{flex:1,textAlign:"center",padding:"6px",borderRadius:6,border:"1px solid #BBF7D0",background:"#fff",color:"#065F46",fontSize:10,fontWeight:600,textDecoration:"none"}}>View ID Card</a>
                            )}
                            {editAgent.bookbankPhotoUrl && (
                              <a href={editAgent.bookbankPhotoUrl} target="_blank" rel="noreferrer" style={{flex:1,textAlign:"center",padding:"6px",borderRadius:6,border:"1px solid #BBF7D0",background:"#fff",color:"#065F46",fontSize:10,fontWeight:600,textDecoration:"none"}}>View Bookbank</a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Share Personal Info Link ── */}
                    <div style={{borderTop:"1px solid #F1F5F9",paddingTop:14}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#0D9488",marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                        Personal &amp; Payroll Info Link
                      </div>
                      <div style={{fontSize:11,color:"#64748B",marginBottom:10,lineHeight:1.5}}>
                        Share this link with {editAgent.name || "this agent"} so they can fill in their phone, ID, bank account, and start date. Send it via Line, WhatsApp, email — whatever works.
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <input readOnly value={getInviteLink(editAgent)} onClick={e=>e.target.select()}
                          style={{flex:1,padding:"9px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F8FAFC",fontSize:11,fontFamily:"monospace",color:"#475569",outline:"none",cursor:"text"}}/>
                        <button onClick={async ()=>{
                          try {
                            await navigator.clipboard.writeText(getInviteLink(editAgent));
                            setInviteSent("copied");
                            setTimeout(()=>setInviteSent(false), 2000);
                          } catch {
                            alert("Couldn't copy automatically. Please select the link and copy manually.");
                          }
                        }}
                          style={{padding:"9px 16px",borderRadius:8,border:"none",background:inviteSent==="copied"?"#34D399":"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",minWidth:110}}>
                          {inviteSent==="copied" ? "Copied!" : "Copy Link"}
                        </button>
                      </div>
                    </div>

                    <div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
                      {/* Remove button: only for existing agents (not while adding a brand-new one), and only managers. */}
                      {(role === "manager") && agents.some(a => a.id === editAgent.id) ? (
                        <button onClick={()=>{
                          if (!window.confirm(`Remove agent "${editAgent.name || editAgent.id}"?\n\nThis will:\n  • Delete this agent from the team list\n  • Remove their assignments from all months and brands\n\nIt cannot be undone.`)) return;
                          const id = editAgent.id;
                          // 1. Remove from agents.
                          setAgents(prev => prev.filter(a => a.id !== id));
                          // 2. Strip them out of every monthly allocation map.
                          setAllAsgn(prev => {
                            const next = {};
                            for (const [mk, m] of Object.entries(prev || {})) {
                              const cleaned = {};
                              for (const [k, v] of Object.entries(m || {})) {
                                if (Array.isArray(v)) {
                                  const filtered = v.filter(x => x !== id);
                                  if (filtered.length) cleaned[k] = filtered;
                                } else if (v !== id) {
                                  cleaned[k] = v;
                                }
                              }
                              next[mk] = cleaned;
                            }
                            return next;
                          });
                          // 3. Strip them out of brand assignments too.
                          setAllBrandAsgn(prev => {
                            const next = {};
                            for (const [mk, m] of Object.entries(prev || {})) {
                              const cleaned = {};
                              for (const [k, v] of Object.entries(m || {})) {
                                if (Array.isArray(v)) {
                                  const filtered = v.filter(x => x !== id && x !== (editAgent.name||""));
                                  if (filtered.length) cleaned[k] = filtered;
                                } else if (v !== id && v !== editAgent.name) {
                                  cleaned[k] = v;
                                }
                              }
                              next[mk] = cleaned;
                            }
                            return next;
                          });
                          // FIX (round-9 senior review MEDIUM/G): also strip
                          // the agent from userAccounts (so they can't sign in
                          // anymore) and from userProfiles (so the payroll
                          // blob doesn't linger as orphaned data). Match by
                          // email (preferred — that's the login key) and by
                          // name as a fallback for legacy entries.
                          const agentEmail = (editAgent.email || "").toLowerCase();
                          const agentName = (editAgent.name || "").toLowerCase();
                          setUserAccounts(prev => (Array.isArray(prev) ? prev : []).filter(u => {
                            const uname = (u?.username || "").toLowerCase();
                            if (agentEmail && uname === agentEmail) return false;
                            if (agentName && uname === agentName) return false;
                            return true;
                          }));
                          setUserProfiles(prev => {
                            const next = { ...(prev || {}) };
                            // userProfiles is keyed by id; also try by name
                            // and email since older entries may use either.
                            delete next[id];
                            if (agentEmail) delete next[agentEmail];
                            if (agentName) delete next[agentName];
                            // Hunt for entries whose payload matches this agent.
                            for (const [k, v] of Object.entries(next)) {
                              const candidate = v || {};
                              if (
                                (candidate.username && candidate.username.toLowerCase() === agentEmail) ||
                                (candidate.fullName && candidate.fullName.toLowerCase() === agentName)
                              ) delete next[k];
                            }
                            return next;
                          });
                          // NOTE: the agent's Supabase Auth account is NOT
                          // deleted here — that requires admin-API access
                          // (service-role key, not client-side). The user is
                          // locked out of the app because their userAccounts
                          // entry is gone, but the Auth row remains until
                          // someone deletes it from the Supabase dashboard.
                          setAgentModal(false);
                        }} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #FCA5A5",background:"#FEF2F2",color:"#DC2626",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>Remove</button>
                      ) : <span/>}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>setAgentModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #E2E8F0",background:"transparent",color:"#6B7280",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Cancel</button>
                        <button onClick={saveAgent} style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* FIX: this modal used to be nested inside the `allocTab==="agents"`
            block, which meant T1/Return agents (who can't access the Teams
            tab) couldn't see it when clicking "Fill it now" on the invoice
            page. Moved out to top-level so it renders regardless of tab. */}
        {/* ── Agent Self-Fill Payroll Form (opened via invite link) ── */}
        {inviteFormModal && (
              <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)"}} onMouseDown={(e)=>{ if (e.target === e.currentTarget) setInviteFormModal(false); }}>
                <div style={{background:"#FFFFFF",borderRadius:18,padding:28,width:500,maxWidth:"94vw",maxHeight:"90vh",overflow:"auto",boxShadow:"0 24px 64px #00000099"}} onClick={e=>e.stopPropagation()}>
                  <div style={{textAlign:"center",marginBottom:22}}>
                    <div style={{fontSize:16,fontWeight:700,color:"#1A1D2E"}}>Welcome to the Team</div>
                    <div style={{fontSize:13,color:"#94A3B8",marginTop:4}}>Please fill in your personal and payroll information</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:8}}>
                      <label style={{cursor:"pointer",textAlign:"center"}}>
                        <div style={{width:100,height:100,borderRadius:"50%",background:inviteFormData.profilePhotoUrl?"transparent":"#F0FDFA",border:"2px solid #0D9488",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",margin:"0 auto"}}>
                          {inviteFormData.profilePhotoUrl
                            ? <img src={inviteFormData.profilePhotoUrl} alt="Profile" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                            : <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>}
                        </div>
                        <div style={{fontSize:11,color:"#0D9488",marginTop:8,fontWeight:600}}>
                          {inviteFormData.profilePhotoUrl ? "เปลี่ยนรูป / Change Photo" : "เพิ่มรูปโปรไฟล์ / Add Profile Photo"}
                        </div>
                        <input type="file" accept="image/*" capture="user" style={{display:"none"}}
                          onChange={async (e)=>{
                            const file = e.target.files?.[0];
                            if(!file) return;
                            const ext = file.name.split('.').pop() || 'jpg';
                            const path = `payroll-docs/profile_${inviteFormAgentId}_${Date.now()}.${ext}`;
                            try {
                              const { error: upErr } = await supabase.storage.from("payroll-docs").upload(path, file, { upsert: true, cacheControl: "3600" });
                              if (upErr) throw upErr;
                              const { data: { publicUrl } } = supabase.storage.from("payroll-docs").getPublicUrl(path);
                              setInviteFormData(d=>({...d, profilePhotoUrl: publicUrl}));
                            } catch (err) {
                              alert("Upload failed: " + err.message);
                            }
                          }}/>
                      </label>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E"}}>Personal Information / ข้อมูลส่วนตัว</div>
                    {[
                      ["fullName","Full Name (English)","text","e.g. Jane Doe"],
                      ["thaiName","ชื่อ-นามสกุล (ภาษาไทย)","text","น.ส.ใจดี ขยันงาน"],
                      ["phone","Phone / เบอร์โทร","tel","081-234-5678"],
                      ["idCard","ID Card Number / เลขบัตรประชาชน","text","1-1234-56789-01-2"],
                      ["taxId","Tax ID / เลขประจำตัวผู้เสียภาษี (13 digits)","text","x-xxxx-xxxxx-xx-x"],
                      ["startDate","Start Date / วันเริ่มงาน","date",""],
                    ].map(([field,label,type,placeholder])=>(
                      <div key={field}>
                        <label style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:5}}>{label}</label>
                        <input type={type} value={inviteFormData[field]} placeholder={placeholder}
                          onChange={e=>setInviteFormData(d=>({...d,[field]:e.target.value}))}
                          style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"1.5px solid #E2E8F0",background:"#F8FAFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                      </div>
                    ))}

                    <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E",marginTop:4}}>Address / ที่อยู่</div>
                    <div>
                      <label style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:5}}>ID Card Address / ที่อยู่ตามหน้าบัตร</label>
                      <textarea value={inviteFormData.idCardAddress}
                        onChange={e=>setInviteFormData(d=>({...d,idCardAddress:e.target.value}))}
                        placeholder="เช่น 99 ถ.ตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพมหานคร 10110"
                        rows={2}
                        style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"1.5px solid #E2E8F0",background:"#F8FAFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical"}}/>
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#475569",cursor:"pointer"}}>
                      <input type="checkbox" checked={inviteFormData.sameAddress}
                        onChange={e=>setInviteFormData(d=>({...d,sameAddress:e.target.checked}))}
                        style={{width:16,height:16}}/>
                      Document delivery address is the same as ID card address
                    </label>
                    {!inviteFormData.sameAddress && (
                      <div>
                        <label style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:5}}>Document Delivery Address / ที่อยู่จัดส่งเอกสาร</label>
                        <textarea value={inviteFormData.docDeliveryAddress}
                          onChange={e=>setInviteFormData(d=>({...d,docDeliveryAddress:e.target.value}))}
                          rows={2}
                          style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"1.5px solid #E2E8F0",background:"#F8FAFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical"}}/>
                      </div>
                    )}

                    <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E",marginTop:4}}>Bank Account / บัญชีธนาคาร</div>
                    {[
                      ["bankName","Bank / ธนาคาร","text","เช่น กสิกรไทย"],
                      ["bankAccountName","Account Holder / ชื่อบัญชี","text","น.ส.ใจดี ขยันงาน"],
                      ["bankAccount","Account Number / เลขที่บัญชี","text","xxx-x-xxxxx-x"],
                    ].map(([field,label,type,placeholder])=>(
                      <div key={field}>
                        <label style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:5}}>{label}</label>
                        <input type={type} value={inviteFormData[field]} placeholder={placeholder}
                          onChange={e=>setInviteFormData(d=>({...d,[field]:e.target.value}))}
                          style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"1.5px solid #E2E8F0",background:"#F8FAFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                      </div>
                    ))}

                    <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E",marginTop:4}}>Documents / เอกสารแนบ</div>
                    {[
                      ["idCardPhotoUrl","ID Card Photo / สำเนาบัตรประชาชน","idCard"],
                      ["bookbankPhotoUrl","Bookbank Photo / สำเนาสมุดบัญชี","bookbank"],
                    ].map(([field,label,kind])=>(
                      <div key={field}>
                        <label style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:.5,display:"block",marginBottom:5}}>{label}</label>
                        {inviteFormData[field] ? (
                          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,border:"1.5px solid #A7F3D0",background:"#ECFDF5"}}>
                            <span style={{fontSize:18}}>✓</span>
                            <a href={inviteFormData[field]} target="_blank" rel="noreferrer" style={{flex:1,fontSize:12,color:"#065F46",textDecoration:"underline",wordBreak:"break-all"}}>View uploaded file</a>
                            <button onClick={()=>setInviteFormData(d=>({...d,[field]:""}))}
                              style={{background:"none",border:"none",color:"#B91C1C",cursor:"pointer",fontSize:11,fontWeight:600}}>Remove</button>
                          </div>
                        ) : (
                          <input type="file" accept="image/*,.pdf"
                            onChange={async (e)=>{
                              const file = e.target.files?.[0];
                              if(!file) return;
                              const ext = file.name.split('.').pop() || 'jpg';
                              const path = `payroll-docs/${kind}_${inviteFormAgentId}_${Date.now()}.${ext}`;
                              try {
                                const { error: upErr } = await supabase.storage.from("payroll-docs").upload(path, file, { upsert: true, cacheControl: "3600" });
                                if (upErr) throw upErr;
                                const { data: { publicUrl } } = supabase.storage.from("payroll-docs").getPublicUrl(path);
                                setInviteFormData(d=>({...d,[field]:publicUrl}));
                              } catch (err) {
                                alert("Upload failed: " + err.message + "\n\nMake sure the 'payroll-docs' Storage bucket exists in Supabase.");
                              }
                            }}
                            style={{width:"100%",padding:"10px 12px",borderRadius:9,border:"1.5px solid #E2E8F0",background:"#F8FAFC",color:"#1A1D2E",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                        )}
                      </div>
                    ))}

                    <div style={{padding:"10px 14px",borderRadius:8,background:"#FEF3C7",border:"1px solid #FDE68A",fontSize:11,color:"#92400E"}}>
                      🔒 Your information is encrypted and only accessible by managers. Photos are stored in Supabase Storage.
                    </div>
                    <button onClick={savePayrollInfo}
                      style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:"#0D9488",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
                      Submit My Information
                    </button>
                  </div>
                </div>
              </div>
            )}

        {/* ══════════════════════════════════════════
            ALLOCATION TAB — Brands × Platforms × T1 Agents
        ══════════════════════════════════════════ */}
        {allocTab==="allocation" && (() => {
          const t1Active = agents.filter(a => a.active && a.team==="T1");
          const selDate = dates[Math.min(allocDateIdx, dates.length-1)] || dates[0];
          if(!selDate) return <div style={{textAlign:"center",padding:48,color:"#94A3B8"}}>No dates in range. Set a date range first.</div>;

          const workingM = getWorkingAgents(selDate.date,"M");
          const workingME = getWorkingAgents(selDate.date,"ME");
          const workingE = getWorkingAgents(selDate.date,"E");
          const pool = allocShiftF==="M" ? workingM : allocShiftF==="ME" ? workingME : workingE;

          // For ME view: only show high-volume brands (top 30%)
          const brandVolSorted = [...brands].sort((a,b) => {
            const va = (a.platforms||[]).reduce((s,p)=>s+(a.chats?.[p]||0),0);
            const vb = (b.platforms||[]).reduce((s,p)=>s+(b.chats?.[p]||0),0);
            return vb - va;
          });
          const highVolCount = Math.max(3, Math.ceil(brands.length * 0.3));
          const highVolIds = new Set(brandVolSorted.slice(0, highVolCount).map(b=>b.id));

          // Filter brands by search + agent filter + ME high-vol filter
          const filteredBrands = brands.filter(b => {
            // FIX (Offboarded brands): hide offboarded brands from the
            // allocation grid so agents can't be assigned to them and the
            // workload counts don't include them.
            if (b.offboarded) return false;
            // CC (call centre) scope: only brands in the role groupScope,
            // matched against group, warehouse, or brand-name suffix.
            const gs = ROLES[role]?.groupScope;
            const hasCallCC = (b.platforms||[]).includes("Call CC"); // brands with a CC channel are visible to CC-role users
            if (gs && !hasCallCC && !(((b.group||"")+" "+(b.wh||"")+" "+(b.name||"")).toLowerCase().includes(gs))) return false;
            // FIX (Start Date): hide brands whose startDate is after the
            // date currently selected in the allocation header. They're not
            // yet active so they shouldn't appear on this day's grid.
            if (b.startDate && selDate?.date && b.startDate > selDate.date) return false;
            // ME shift: only show high-volume brands
            if (allocShiftF==="ME" && !highVolIds.has(b.id)) return false;
            const matchesSearch = brandSearch==="" || b.name.toLowerCase().includes(brandSearch.toLowerCase());
            if (!matchesSearch) return false;
            if (!allocAgentFilter) return true;
            return (b.platforms||[]).some(plat => {
              const k = `${b.id}_${selDate.date}_${allocShiftF}_${plat}`;
              const raw = brandAsgn[k];
              const names = [...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
              return names.includes(allocAgentFilter);
            });
          });

          return (
            <div>
              {/* Controls */}
              <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <div style={{position:"relative",flex:1,minWidth:160}}>
                  <Search size={12} color="#94A3B8" style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)"}}/>
                  <input value={brandSearch} onChange={e=>setBrandSearch(e.target.value)} placeholder="Search brand…"
                    style={{...inpS,paddingLeft:28,width:"100%",boxSizing:"border-box"}}/>
                </div>
                {/* Shift toggle */}
                <div style={{display:"flex",gap:3,background:"#F1F5F9",borderRadius:8,padding:3}}>
                  {[["M","AM"],["ME","MID"],["E","PM"]].map(([s,l])=>(
                    <button key={s} onClick={()=>{setAllocShiftF(s);setAllocAgentFilter("");}} style={{
                      padding:"6px 14px",border:"none",cursor:"pointer",fontSize:11,fontWeight:600,borderRadius:6,
                      background:allocShiftF===s?ALLOC_SHIFT_C[s].bg:"transparent",
                      color:allocShiftF===s?ALLOC_SHIFT_C[s].color:"#94A3B8",fontFamily:"inherit"
                    }}>{l}</button>
                  ))}
                </div>
                <button onClick={()=>{
                  const newId=`b${String(brands.length+1).padStart(2,"0")}`;
                  setEditBrand({id:newId,name:"",group:"",wh:"",platforms:[]});
                  setBrandModal(true);
                }} style={{padding:"8px 14px",borderRadius:9,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  + Add Brand
                </button>
                <button onClick={()=>{if(isLocked){alert("This month is locked.");return;}safeSetBrandAsgn(autoAllocateBrands(brands,agents,asgn,dates,brandAsgn,monthlyVol,currentMK));}}
                  style={{padding:"8px 14px",borderRadius:9,border:"none",background:isLocked?"#CBD5E1":"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:isLocked?"not-allowed":"pointer",fontFamily:"inherit"}}>
                  Auto-Allocate All
                </button>
                <button onClick={()=>{if(isLocked){alert("This month is locked.");return;}safeSetBrandAsgn({});}} style={{padding:"8px 14px",borderRadius:9,border:"1px solid #E2E8F0",background:"transparent",color:isLocked?"#CBD5E1":"#6B7280",fontSize:12,cursor:isLocked?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:600}}>Clear</button>
                {role==="manager" && (
                  <button onClick={toggleLock} style={{padding:"8px 12px",borderRadius:9,border:`1px solid ${isLocked?"#F59E0B":"#E2E8F0"}`,background:isLocked?"#FEF3C7":"transparent",color:isLocked?"#D97706":"#94A3B8",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                    {isLocked?"Unlock":"Lock"}
                  </button>
                )}
                <div style={{width:1,background:"#E2E8F0",margin:"0 2px"}}/>
                <button onClick={exportAllocXLSX}
                  style={{padding:"7px 12px",borderRadius:9,border:"1px solid #06C75544",background:"#ECFDF5",color:"#065F46",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                  Export
                </button>
                <button onClick={exportAllocPDF}
                  style={{padding:"7px 12px",borderRadius:9,border:"1px solid #F87171",background:"#FFF5F5",color:"#B91C1C",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                  PDF
                </button>
              </div>

              {/* Agent filter chips */}
              {pool.length > 0 && (
                <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"#94A3B8",fontWeight:600}}>Filter by agent:</span>
                  <button onClick={()=>setAllocAgentFilter("")}
                    style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${!allocAgentFilter?"#5EEAD4":"#E2E8F0"}`,background:!allocAgentFilter?"#F0FDFA":"transparent",color:!allocAgentFilter?"#0D9488":"#94A3B8",fontSize:11,fontWeight:!allocAgentFilter?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                    All
                  </button>
                  {pool.map(ag => {
                    const active = allocAgentFilter===ag.name;
                    // Count unique brands and total avg chats/day/shift for this agent
                    let count = 0, totalChats = 0;
                    const assignedBrands = new Set();
                    brands.forEach(b => {
                      (b.platforms||[]).forEach(plat => {
                        const k=`${b.id}_${selDate.date}_${allocShiftF}_${plat}`;
                        const raw=brandAsgn[k];
                        const names=[...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
                        if(names.includes(ag.name)) {
                          assignedBrands.add(b.id);
                          // FIX (round-7 review LOW): use per-month chats from monthlyVol
                          // (the displayed month context) instead of brands.chats global default.
                          // Pills now move when you switch month, matching the Performance display.
                          const selMk = (selDate?.date || "").slice(0, 7);
                          const monthChats = getBrandChats(b, plat, monthlyVol, selMk || currentMK);
                          totalChats += Math.round(monthChats / 30 / 2 / Math.max(names.length,1));
                        }
                      });
                    });
                    count = assignedBrands.size;
                    return (
                      <button key={ag.id} onClick={()=>setAllocAgentFilter(active?"":ag.name)}
                        title={count>0 ? `${count} brand${count>1?"s":""} · ~${totalChats} chats/day for ${ag.name} on this date+shift` : ag.name}
                        style={{display:"flex",alignItems:"center",gap:5,padding:"4px 12px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:active?700:400,
                          border:`1px solid ${active?"#5EEAD4":"#E2E8F0"}`,
                          background:active?"#F0FDFA":"transparent",
                          color:active?"#0D9488":"#475569"}}>
                        {ag.name}
                        {count>0 && (
                          <span title="brands assigned" style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:8,background:active?"#99F6E4":"#F1F5F9",color:active?"#0D9488":"#94A3B8"}}>{count}</span>
                        )}
                        {totalChats>0 && (
                          <span title="estimated chats per day on this shift" style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:8,background:active?"#FDE68A":"#FEF3C7",color:active?"#92400E":"#B45309"}}>~{totalChats}c</span>
                        )}
                      </button>
                    );
                  })}
                  {allocAgentFilter && (() => {
                    // Compute total estimated chats/day for the currently-filtered agent
                    // FIX (round-7): per-month chats so the footer label matches what the pills now show
                    const selMk = (selDate?.date || "").slice(0, 7);
                    let agentChats = 0;
                    brands.forEach(b => {
                      (b.platforms||[]).forEach(plat => {
                        const k=`${b.id}_${selDate.date}_${allocShiftF}_${plat}`;
                        const raw=brandAsgn[k];
                        const names=[...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
                        if(names.includes(allocAgentFilter)) {
                          const monthChats = getBrandChats(b, plat, monthlyVol, selMk || currentMK);
                          agentChats += Math.round(monthChats / 30 / 2 / Math.max(names.length,1));
                        }
                      });
                    });
                    return (
                      <span style={{fontSize:11,color:"#94A3B8",marginLeft:4}}>
                        — showing <strong style={{color:"#1A1D2E"}}>{filteredBrands.length}</strong> brand{filteredBrands.length!==1?"s":""} · <strong style={{color:"#B45309"}}>~{agentChats} chats/day</strong> for <strong style={{color:"#0D9488"}}>{allocAgentFilter}</strong>
                      </span>
                    );
                  })()}
                </div>
              )}

              {/* Date navigator */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#94A3B8",fontWeight:700}}>Date:</span>
                <button onClick={()=>setAllocDateIdx(Math.max(0,allocDateIdx-1))} style={{width:26,height:26,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,color:"#1A1D2E",minWidth:100,textAlign:"center"}}>
                  {selDate.dd}/{selDate.mm} {selDate.day}
                </div>
                <button onClick={()=>setAllocDateIdx(Math.min(dates.length-1,allocDateIdx+1))} style={{width:26,height:26,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                {/* Working agents indicator */}
                <div style={{marginLeft:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[["M","Morning",workingM],["E","Evening",workingE]].map(([s,label,p])=>(
                    <div key={s} onClick={()=>{setAllocShiftF(s);setAllocAgentFilter("");}} title="Click to show this shift in the table below" style={{display:"flex",alignItems:"center",gap:5,background:ALLOC_SHIFT_C[s].bg,borderRadius:8,padding:"4px 10px",cursor:"pointer",border:`1px solid ${allocShiftF===s?ALLOC_SHIFT_C[s].color:`${ALLOC_SHIFT_C[s].color}33`}`,boxShadow:allocShiftF===s?`0 0 0 1.5px ${ALLOC_SHIFT_C[s].color}`:"none"}}>
                      <span style={{fontSize:10,fontWeight:700,color:ALLOC_SHIFT_C[s].color}}>{label}: {p.length}</span>
                      <span style={{fontSize:10,color:"#94A3B8"}}>{p.map(a=>a.name).join(", ")||"—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Brand allocation table — per platform rows */}
              <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden",marginBottom:16}}>
                <div style={{padding:"10px 16px",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E"}}>
                    Brand × Platform → Agent  <span style={{color:"#94A3B8",fontWeight:400,fontSize:11}}>({allocShiftF==="M"?"Morning":"Evening"} shift)</span>
                  </div>
                  <div style={{fontSize:11,color:"#94A3B8"}}>{filteredBrands.length} brands · {pool.length} agents on shift</div>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{background:"#E4EAF5"}}>
                        <th style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:28}}>#</th>
                        <th style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:160}}>Brand</th>
                        <th style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:70}}>Group</th>
                        <th style={{padding:"8px 12px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#B45309",textTransform:"uppercase",minWidth:80}}>Total Chats</th>
                        <th style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:90}}>Platform</th>
                        <th style={{padding:"8px 12px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:70}}>Avg/Day/Shift</th>
                        <th style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:160}}>Assigned Agent</th>
                        <th style={{padding:"8px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:80}}>Status</th>
                        <th style={{padding:"8px 12px",borderBottom:"1px solid #E2E8F0",minWidth:50}}/>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBrands.map((b, bi) => {
                        const allPlats = b.platforms && b.platforms.length > 0 ? b.platforms : ["—"];
                        // When filtering by agent, only show platforms assigned to that agent
                        const visPlats = allocAgentFilter
                          ? allPlats.filter(plat => {
                              if(plat==="—") return false;
                              const k = `${b.id}_${selDate.date}_${allocShiftF}_${plat}`;
                              const raw = brandAsgn[k];
                              const names = [...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))];
                              return names.includes(allocAgentFilter);
                            })
                          : allPlats;
                        if(visPlats.length===0) return null;
                        return visPlats.map((plat, pi) => {
                          const isRealPlat = plat !== "—";
                          const k = isRealPlat ? `${b.id}_${selDate.date}_${allocShiftF}_${plat}` : null;
                          const pc = isRealPlat ? PLATFORM_C[plat] : null;
                          const rowBg = bi%2===0 ? "#FAFBFC" : "transparent";
                          return (
                            <tr key={`${b.id}_${plat}`} style={{borderBottom:"1px solid #F1F5F9",background:rowBg}}>
                              {/* Brand name — only on first visible platform row */}
                              {pi===0 && (
                                <td rowSpan={visPlats.length} style={{padding:"8px 12px",fontFamily:"monospace",fontSize:10,color:"#94A3B8",verticalAlign:"top",paddingTop:12}}>{bi+1}</td>
                              )}
                              {pi===0 && (
                                <td rowSpan={visPlats.length} style={{padding:"8px 12px",verticalAlign:"top",paddingTop:12,borderRight:"1px solid #F1F5F9"}}>
                                  <div style={{fontWeight:700,color:"#1A1D2E",fontSize:12}}>{b.name}</div>
                                </td>
                              )}
                              {pi===0 && (
                                <td rowSpan={visPlats.length} style={{padding:"8px 12px",verticalAlign:"top",paddingTop:12,borderRight:"1px solid #F1F5F9"}}>
                                  <span style={{fontSize:10,padding:"2px 7px",borderRadius:6,background:"#F1F5F9",color:"#94A3B8",fontWeight:600}}>{b.wh||"—"}</span>
                                </td>
                              )}
                              {/* Total chats — only on first row */}
                              {pi===0 && (() => {
                                const selMk2 = (selDate?.date || "").slice(0, 7);
                                const volMkUsed = getVolSourceMk(monthlyVol, selMk2 || currentMK);
                                const chatsOf = (x) => (x.platforms||[]).reduce((s,pl)=>s+getBrandChats(x, pl, monthlyVol, selMk2 || currentMK),0);
                                const hasActual = !!(volMkUsed && monthlyVol[volMkUsed]?.[b.id]);
                                const total = chatsOf(b);
                                const avgDay = Math.round(total / 30 / 2);
                                const maxTotal = Math.max(...filteredBrands.map(chatsOf),1);
                                const pct = Math.round((total/maxTotal)*100);
                                return (
                                  <td rowSpan={visPlats.length} style={{padding:"8px 12px",verticalAlign:"top",paddingTop:12,borderRight:"1px solid #F1F5F9",textAlign:"right"}}>
                                    <div title={hasActual?(volMkUsed===selMk2?"Actual imported chat volume for this month":("Using latest imported performance data: "+volMkUsed)):"No imported volume - using brand default numbers"} style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:hasActual?"#B45309":"#94A3B8"}}>{total.toLocaleString()}{hasActual && volMkUsed!==selMk2 && <span style={{fontSize:8,fontWeight:600,marginLeft:3,color:"#0D9488"}}>{volMkUsed}</span>}{!hasActual && <span style={{fontSize:8,fontWeight:600,marginLeft:3}}>est</span>}</div>
                                    <div style={{fontFamily:"monospace",fontSize:9,color:"#94A3B8",marginTop:2}}>~{avgDay}/day/shift</div>
                                    <div style={{marginTop:4,height:4,borderRadius:2,background:"#F1F5F9",overflow:"hidden",width:60,marginLeft:"auto"}}>
                                      <div style={{height:"100%",width:`${pct}%`,background:"#F59E0B",borderRadius:2}}/>
                                    </div>
                                  </td>
                                );
                              })()}
                              {/* Platform cell */}
                              <td style={{padding:"6px 12px",borderRight:"1px solid #F1F5F9"}}>
                                {isRealPlat && pc ? (
                                  <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"3px 8px",borderRadius:6,background:pc.bg,color:pc.color,fontWeight:700}}>
                                    {pc.icon} {plat}
                                  </span>
                                ) : (
                                  <span style={{fontSize:10,color:"#94A3B8"}}>No platforms</span>
                                )}
                              </td>
                              {/* Per-platform chats — avg per day per shift ÷ shared agents */}
                              <td style={{padding:"6px 12px",borderRight:"1px solid #F1F5F9",textAlign:"right"}}>
                                {isRealPlat ? (() => {
                                  const monthly = b.chats?.[plat] || 0;
                                  const raw = brandAsgn[k];
                                  const agentCount = Math.max([...new Set(Array.isArray(raw)?raw:(raw?[raw]:[]))].length, 1);
                                  const avgTotal = Math.round(monthly / 30 / 2);
                                  const avgPerAgent = Math.round(avgTotal / agentCount);
                                  return (
                                    <div style={{textAlign:"right"}}>
                                      <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:avgPerAgent>50?"#F87171":avgPerAgent>20?"#F59E0B":"#6B7280"}}>
                                        {avgPerAgent.toLocaleString()}
                                      </span>
                                      {agentCount > 1 && (
                                        <div style={{fontSize:9,color:"#94A3B8",fontFamily:"monospace"}}>
                                          {avgTotal}÷{agentCount}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })() : <span style={{color:"#E2E8F0"}}>—</span>}
                              </td>
                              {/* Assigned agents — chips + add dropdown */}
                              <td style={{padding:"5px 10px",borderRight:"1px solid #F1F5F9",minWidth:180}}>
                                {isRealPlat ? (() => {
                                  const raw = brandAsgn[k];
                                  const assigned = [...new Set(Array.isArray(raw) ? raw : (raw ? [raw] : []))];
                                  const allOnShift = pool.map(a=>a.name);
                                  const available = [...pool, ...t1Active.filter(a=>!pool.some(p=>p.id===a.id))];
                                  const unassigned = available.filter(a=>!assigned.includes(a.name));
                                  const removeAgent = (name) => { if(isLocked) return; safeSetBrandAsgn(p=>({...p,[k]:assigned.filter(n=>n!==name)})); };
                                  const addAgent = (name) => { if(isLocked) return; if(name && !assigned.includes(name)) safeSetBrandAsgn(p=>({...p,[k]:[...assigned,name]})); };
                                  return (
                                    <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                                      {assigned.map(name => {
                                        const onShift = allOnShift.includes(name);
                                        return (
                                          <span key={name} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 6px 2px 8px",borderRadius:6,fontSize:11,fontWeight:700,
                                            background:onShift?"#F0FDFA":"#FEE2E2",
                                            border:`1px solid ${onShift?"#5EEAD455":"#F8717155"}`,
                                            color:onShift?"#5EEAD4":"#F87171"}}>
                                            {name}
                                            <button onClick={()=>removeAgent(name)} style={{background:"none",border:"none",cursor:"pointer",color:"inherit",fontSize:11,padding:"0 0 0 2px",lineHeight:1,opacity:0.7}}>×</button>
                                          </span>
                                        );
                                      })}
                                      {unassigned.length > 0 && (
                                        <select value="" onChange={e=>{addAgent(e.target.value);e.target.value="";}}
                                          style={{padding:"2px 6px",borderRadius:6,border:"1px dashed #E2E8F0",background:"transparent",color:"#94A3B8",fontSize:11,fontFamily:"inherit",outline:"none",cursor:"pointer",maxWidth:100}}>
                                          <option value="">+ Add</option>
                                          {pool.filter(a=>!assigned.includes(a.name)).map(a=><option key={a.id} value={a.name}>{a.name}</option>)}
                                          {t1Active.filter(a=>!pool.some(p=>p.id===a.id)&&!assigned.includes(a.name)).map(a=><option key={a.id} value={a.name}>{a.name} ↓</option>)}
                                        </select>
                                      )}
                                    </div>
                                  );
                                })() : <span style={{fontSize:10,color:"#E2E8F0"}}>—</span>}
                              </td>
                              {/* Status */}
                              <td style={{padding:"6px 12px",borderRight:"1px solid #F1F5F9"}}>
                                {isRealPlat && (() => {
                                  const raw = brandAsgn[k];
                                  const assigned = [...new Set(Array.isArray(raw) ? raw : (raw ? [raw] : []))];
                                  const count = assigned.length;
                                  const allOnShift = assigned.every(n => pool.some(a=>a.name===n));
                                  return (
                                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:6,fontWeight:700,
                                      background:count>0?(allOnShift?"#D1FAE5":"#FEF3C7"):"#94A3B822",
                                      color:count>0?(allOnShift?"#06C755":"#F59E0B"):"#94A3B8"}}>
                                      {count>0 ? `✓ ${count}` : "Pending"}
                                    </span>
                                  );
                                })()}
                              </td>
                              {/* Edit brand button — only on first platform row */}
                              {pi===0 && (
                                <td rowSpan={visPlats.length} style={{padding:"8px 10px",verticalAlign:"top",paddingTop:10,textAlign:"center"}}>
                                  <button onClick={()=>openBrand(b)}
                                    style={{padding:"3px 10px",borderRadius:7,border:"none",background:"transparent",color:"#0D9488",fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                                    Edit
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Brand Add/Edit Modal ── */}
              {brandModal && editBrand && (
                <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.65)",backdropFilter:"blur(4px)"}} onClick={()=>setBrandModal(false)}>
                  <div style={{background:"#FFFFFF",borderRadius:16,border:"1px solid #E2E8F0",padding:24,width:480,maxWidth:"92vw",maxHeight:"85vh",overflow:"auto",boxShadow:"0 16px 48px #00000099"}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                      <div style={{fontSize:15,fontWeight:700}}>{editBrand.name||"New Brand"}</div>
                      <button onClick={()=>setBrandModal(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#6B7280",fontSize:18}}>×</button>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:14}}>
                      {/* Name */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Brand Name</label>
                        <input value={editBrand.name} onChange={e=>setEditBrand({...editBrand,name:e.target.value})}
                          placeholder="e.g. Casio-CMG"
                          style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                      </div>
                      {/* WH + Group */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                        <div>
                          <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Warehouse (WH)</label>
                          <input value={editBrand.wh} onChange={e=>setEditBrand({...editBrand,wh:e.target.value})}
                            placeholder="e.g. CMG, Inh, PVH"
                            style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                        </div>
                        <div>
                          <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Group</label>
                          <input value={editBrand.group} onChange={e=>setEditBrand({...editBrand,group:e.target.value})}
                            placeholder="e.g. 1, 2 (optional)"
                            style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                        </div>
                      </div>
                      {/* Platforms multi-select */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:8}}>
                          Platforms <span style={{fontWeight:400,color:"#94A3B8",fontSize:9,textTransform:"none"}}>(select all that apply)</span>
                        </label>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                          {PLATFORMS.map(p => {
                            const on = (editBrand.platforms||[]).includes(p);
                            const pc = PLATFORM_C[p];
                            return (
                              <button key={p} onClick={()=>{
                                const cur = editBrand.platforms||[];
                                setEditBrand({...editBrand, platforms: on ? cur.filter(x=>x!==p) : [...cur,p]});
                              }} style={{
                                display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:12,
                                border:on?`2px solid ${pc.color}`:"1px solid #E2E8F0",
                                background:on?pc.bg:"transparent",
                                color:on?pc.color:"#94A3B8",
                                transition:"all 0.15s"
                              }}>
                                <span style={{fontSize:14}}>{pc.icon}</span>
                                {p}
                                {on && <span style={{fontSize:10,marginLeft:2}}>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                        {(editBrand.platforms||[]).length === 0 && (
                          <div style={{marginTop:6,fontSize:10,color:"#B45309"}}>— No platforms selected — brand won't appear in allocation</div>
                        )}
                      </div>
                      {/* Chat volumes per platform */}
                      {(editBrand.platforms||[]).length > 0 && (
                        <div>
                          <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:8}}>
                            Monthly Chat Volume <span style={{fontWeight:400,color:"#94A3B8",fontSize:9,textTransform:"none"}}>(chats / month per platform)</span>
                          </label>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
                            {(editBrand.platforms||[]).map(p => {
                              const pc = PLATFORM_C[p];
                              const val = editBrand.chats?.[p] || 0;
                              return (
                                <div key={p} style={{background:"#FAFBFC",borderRadius:8,padding:"10px 12px",border:`1px solid ${pc.color}33`}}>
                                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                                    <span style={{fontSize:13}}>{pc.icon}</span>
                                    <span style={{fontSize:11,fontWeight:700,color:pc.color}}>{p}</span>
                                  </div>
                                  <input type="number" min="0" value={val}
                                    onChange={e=>setEditBrand({...editBrand,chats:{...(editBrand.chats||{}), [p]:Number(e.target.value)}})}
                                    style={{width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${pc.color}44`,background:"#FFFFFF",color:pc.color,fontSize:13,fontFamily:"monospace",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{marginTop:8,display:"flex",justifyContent:"flex-end"}}>
                            <span style={{fontSize:11,color:"#94A3B8"}}>Total: </span>
                            <span style={{fontSize:12,fontFamily:"monospace",fontWeight:700,color:"#B45309",marginLeft:4}}>
                              {(editBrand.platforms||[]).reduce((s,p)=>s+(editBrand.chats?.[p]||0),0).toLocaleString()} chats/mo
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Start Date — allocation only kicks in from this date onward */}
                      <div style={{borderTop:"1px solid #F1F5F9",paddingTop:14,marginTop:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <label style={{fontSize:11,color:"#94A3B8",fontWeight:600,textTransform:"uppercase",letterSpacing:0.3,minWidth:90}}>
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={editBrand.startDate || ""}
                            onChange={e=>setEditBrand({...editBrand, startDate: e.target.value})}
                            style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit",color:"#1A1D2E",background:"#fff",outline:"none"}}
                          />
                          <span style={{fontSize:10,color:"#94A3B8"}}>
                            Agents will only be allocated from this date onward. Leave blank for no start-date restriction.
                          </span>
                        </div>
                      </div>
                      {/* Offboarded toggle + date */}
                      <div style={{borderTop:"1px solid #F1F5F9",paddingTop:14,marginTop:6}}>
                        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"#475569"}}>
                          <input
                            type="checkbox"
                            checked={!!editBrand.offboarded}
                            onChange={e=>{
                              const checked = e.target.checked;
                              setEditBrand({
                                ...editBrand,
                                offboarded: checked,
                                offboardedDate: checked
                                  ? (editBrand.offboardedDate || new Date().toISOString().slice(0,10))
                                  : "",
                              });
                            }}
                            style={{width:16,height:16,cursor:"pointer"}}
                          />
                          Offboarded — exclude from allocation
                        </label>
                        {editBrand.offboarded && (
                          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:10}}>
                            <label style={{fontSize:11,color:"#94A3B8",fontWeight:600,textTransform:"uppercase",letterSpacing:0.3}}>
                              Offboarded Date
                            </label>
                            <input
                              type="date"
                              value={editBrand.offboardedDate || ""}
                              onChange={e=>setEditBrand({...editBrand, offboardedDate: e.target.value})}
                              style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit",color:"#1A1D2E",background:"#fff",outline:"none"}}
                            />
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      <div style={{display:"flex",gap:8,justifyContent:"space-between",marginTop:4}}>
                        <div>
                          {brands.find(b=>b.id===editBrand.id) && (
                            <button onClick={()=>deleteBrand(editBrand.id)}
                              style={{padding:"8px 14px",borderRadius:8,border:"none",background:"#FEE2E2",color:"#B91C1C",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                              Delete
                            </button>
                          )}
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>setBrandModal(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #E2E8F0",background:"transparent",color:"#6B7280",fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Cancel</button>
                          <button onClick={saveBrand} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save Brand</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════
            DATES TAB
        ══════════════════════════════════════════ */}
        {allocTab==="dates" && (
          <div>
            <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",padding:18,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:12,color:"#1A1D2E"}}>Add Date Flag</div>
              <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Date</label>
                  <input type="date" value={addFlagDate} onChange={e=>setAddFlagDate(e.target.value)}
                    style={{padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none"}}/></div>
                <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Type</label>
                  <select value={addFlagType} onChange={e=>setAddFlagType(e.target.value)}
                    style={{padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none"}}>
                    <option value="holiday">Public Holiday</option>
                    <option value="campaign">Campaign</option>
                  </select></div>
                <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Label</label>
                  <input value={addFlagLabel} onChange={e=>setAddFlagLabel(e.target.value)} placeholder="e.g. Songkran"
                    style={{padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none"}}/></div>
                <button onClick={()=>{
                  if(!addFlagDate) return;
                  safeSetFlags(p=>({...p,[addFlagDate]:{type:addFlagType,label:addFlagLabel||(addFlagType==="holiday"?"Public Holiday":"Campaign")}}));
                  setAddFlagDate(""); setAddFlagLabel("");
                }} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  + Add
                </button>
              </div>
            </div>
            <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#F1F5F9"}}>
                  {["Date","Type","Label","In Roster",""].map(h=>(
                    <th key={h} style={{padding:"9px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {Object.entries(flags).sort(([a],[b])=>a.localeCompare(b)).map(([dt,fl])=>{
                    const inP=dates.some(d=>d.date===dt); const isH=fl.type==="holiday";
                    return (
                      <tr key={dt} style={{borderBottom:"1px solid #F1F5F9",background:isH?"#F59E0B08":"#14B8A608"}}>
                        <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:600,color:"#1A1D2E"}}>{dt}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:isH?"#FEF3C7":"#F0FDFA",color:isH?"#F59E0B":"#5EEAD4",fontWeight:700}}>{isH?"Holiday":"Campaign"}</span></td>
                        <td style={{padding:"8px 12px",fontWeight:600,color:"#475569"}}>{fl.label}</td>
                        <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:inP?"#D1FAE5":"#94A3B822",color:inP?"#06C755":"#6B7280",fontWeight:700}}>{inP?"✓ Yes":"Outside"}</span></td>
                        <td style={{padding:"8px 12px"}}>
                          <button onClick={()=>safeSetFlags(p=>{const n={...p};delete n[dt];return n;})}
                            style={{padding:"3px 10px",borderRadius:7,border:"none",background:"#FEE2E2",color:"#B91C1C",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>Remove</button>
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(flags).length===0 && (
                    <tr><td colSpan={5} style={{padding:24,textAlign:"center",color:"#94A3B8",fontSize:13}}>No dates flagged yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            BUDGET TAB
        ══════════════════════════════════════════ */}
        {allocTab==="budget" && (
          <div>
            {/* ── Cost / Chat Report (top of report) — manager only ── */}
            {role!=="viewer" && (() => {
              // ── Date range logic ──────────────────────────────────
              // Determine which months are in range
              const rangeStart = reportStartDate || `${rosterYear}-${String(rosterMonth).padStart(2,"0")}-01`;
              const rangeEnd = reportEndDate || `${rosterYear}-${String(rosterMonth).padStart(2,"0")}-${new Date(rosterYear, rosterMonth, 0).getDate()}`;
              const startD = new Date(rangeStart + "T00:00:00");
              const endD = new Date(rangeEnd + "T00:00:00");

              // Collect all months in range
              const rangeMonths = [];
              let cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
              while (cur <= endD) {
                rangeMonths.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`);
                cur.setMonth(cur.getMonth()+1);
              }

              // Sum chats across all months in range
              const rangeBrandChats = {}; // brandId → {platform → totalChats}
              rangeMonths.forEach(mk => {
                const vol = monthlyVol[mk];
                if (!vol) return;
                Object.entries(vol).forEach(([bid, platVol]) => {
                  if (!rangeBrandChats[bid]) rangeBrandChats[bid] = {};
                  Object.entries(platVol).forEach(([p, c]) => {
                    rangeBrandChats[bid][p] = (rangeBrandChats[bid][p]||0) + (c||0);
                  });
                });
              });

              // If no monthlyVol data found, fall back to current month brands.chats
              const hasRangeData = Object.keys(rangeBrandChats).length > 0;
              if (!hasRangeData) {
                brands.forEach(b => {
                  rangeBrandChats[b.id] = {};
                  (b.platforms||[]).forEach(p => { rangeBrandChats[b.id][p] = b.chats?.[p]||0; });
                });
              }

              const grandTotalChats = Object.values(rangeBrandChats).reduce((s, pv) => s + Object.values(pv).reduce((a,b)=>a+b,0), 0);

              // Calculate costs for days in range
              // Get all roster dates that fall within range
              const allRangeDates = [];
              rangeMonths.forEach(mk => {
                const [y,m] = mk.split("-").map(Number);
                const daysInMonth = new Date(y, m, 0).getDate();
                for (let d=1; d<=daysInMonth; d++) {
                  const ds = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                  const dt = new Date(ds+"T00:00:00");
                  if (dt >= startD && dt <= endD) allRangeDates.push({date:ds, y, m});
                }
              });

              // Cost: T1/Return worked days across range
              let rangeTotalCost = 0;
              const isSingleMonth = rangeMonths.length === 1 && rangeMonths[0] === `${rosterYear}-${String(rosterMonth).padStart(2,"0")}`;

              if (isSingleMonth) {
                // Use the already-computed totalCost for current month (accurate)
                rangeTotalCost = totalCost;
              } else {
                // Multi-month: compute per-month costs
                rangeMonths.forEach(mk => {
                  const monthAsgn = allAsgn[mk] || {};
                  // T1/Return worked days in this month
                  const t1r = agents.filter(a=>a.active && a.team!=="T2");
                  t1r.forEach(ag => {
                    allRangeDates.filter(d => `${d.y}-${String(d.m).padStart(2,"0")}` === mk).forEach(({date}) => {
                      const v = monthAsgn[`${ag.id}_${date}`];
                      if (v && v!=="Off") rangeTotalCost += ag.costDay;
                    });
                  });
                  // T2 salary for this month (pro-rated if partial month).
                  // Look up the salary for this specific month.
                  const [my, mm] = mk.split("-").map(Number);
                  const monthSalary = (fulltimeSalary && fulltimeSalary[mk]) || 0;
                  const daysInMonth = new Date(my, mm, 0).getDate();
                  const daysInRange = allRangeDates.filter(d => d.y===my && d.m===mm).length;
                  rangeTotalCost += monthSalary * (daysInRange / daysInMonth);
                });
              }

              const costPerChatAll = grandTotalChats > 0 ? rangeTotalCost / grandTotalChats : 0;

              const allBrandRows = brands
                .map(b => {
                  const bChats = rangeBrandChats[b.id] || {};
                  const totalBrandChats = Object.values(bChats).reduce((s,v)=>s+v, 0);
                  const pct = grandTotalChats > 0 ? totalBrandChats / grandTotalChats : 0;
                  const allocatedCost = Math.round(pct * rangeTotalCost);
                  const costPerChat = totalBrandChats > 0 ? allocatedCost / totalBrandChats : 0;
                  const cpcColor = costPerChat > 0 ? (costPerChat <= 3 ? "#059669" : costPerChat <= 8 ? "#D97706" : "#EF4444") : "#94A3B8";
                  const platBreakdown = (b.platforms||[]).map(p => ({plat:p, chats:bChats[p]||0})).filter(x=>x.chats>0);
                  return {b, totalBrandChats, pct, allocatedCost, costPerChat, cpcColor, platBreakdown};
                })
                .filter(r => r.totalBrandChats > 0)
                .sort((a,b) => b.totalBrandChats - a.totalBrandChats);

              // Get unique groups for filter
              const groups = [...new Set(allBrandRows.map(r=>r.b.wh||"").filter(Boolean))].sort();
              const brandRows = reportGroupFilter==="all" ? allBrandRows : allBrandRows.filter(r=>(r.b.wh||"")===reportGroupFilter);

              const exportChatCSV = () => {
                const rows = [["Brand","Group","Total Chats","Volume %","Allocated Cost (฿)","Cost/Chat (฿)","Platform","Platform Chats"]];
                brandRows.forEach(({b,totalBrandChats,pct,allocatedCost,costPerChat,platBreakdown}) => {
                  platBreakdown.forEach((pd,i) => {
                    rows.push(i===0 ? [b.name,b.wh||"",totalBrandChats,(pct*100).toFixed(1)+"%",allocatedCost,costPerChat.toFixed(2),pd.plat,pd.chats] : ["","","","","","",pd.plat,pd.chats]);
                  });
                  if(!platBreakdown.length) rows.push([b.name,b.wh||"",totalBrandChats,(pct*100).toFixed(1)+"%",allocatedCost,costPerChat.toFixed(2),"",""]);
                });
                rows.push(["TOTAL","",grandTotalChats,"100%",Math.round(rangeTotalCost),costPerChatAll.toFixed(2),"",""]);
                dlXLSX(rows, `CostPerChat_${rangeStart}_to_${rangeEnd}.xlsx`);
              };

              return (
                <div>
                  {/* Date range picker */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Date Range:</div>
                    <input type="date" value={reportStartDate||rangeStart} onChange={e=>setReportStartDate(e.target.value)}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit",color:"#1A1D2E",outline:"none"}}/>
                    <span style={{color:"#94A3B8"}}>→</span>
                    <input type="date" value={reportEndDate||rangeEnd} onChange={e=>setReportEndDate(e.target.value)}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,fontFamily:"inherit",color:"#1A1D2E",outline:"none"}}/>
                    {(reportStartDate||reportEndDate) && (
                      <button onClick={()=>{setReportStartDate("");setReportEndDate("");}} style={{padding:"4px 10px",borderRadius:6,border:"none",background:"#FEF2F2",color:"#EF4444",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Reset</button>
                    )}
                    <div style={{fontSize:10,color:"#94A3B8",marginLeft:"auto"}}>{rangeMonths.length} month{rangeMonths.length>1?"s":""} · {allRangeDates.length} days</div>
                  </div>

                  {/* Month-shortcut buttons — click to set range to that month */}
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                    <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,marginRight:4}}>Quick month:</div>
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((mn, i) => {
                      const mNum = i + 1;
                      const last = new Date(rosterYear, mNum, 0).getDate();
                      const from = `${rosterYear}-${String(mNum).padStart(2,"0")}-01`;
                      const to   = `${rosterYear}-${String(mNum).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
                      const active = reportStartDate === from && reportEndDate === to;
                      return (
                        <button key={mn} onClick={()=>{ setReportStartDate(from); setReportEndDate(to); }} style={{
                          padding:"3px 9px", borderRadius:6,
                          border: active ? "none" : "1px solid #E2E8F0",
                          background: active ? "#0D9488" : "#F8FAFC",
                          color: active ? "#fff" : "#64748B",
                          fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                        }}>{mn}</button>
                      );
                    })}
                  </div>

                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:16}}>
                    <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #E2E8F0",boxShadow:"0 1px 3px #0001"}}>
                      <div style={{fontSize:10,color:"#0D9488",fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Total Chats</div>
                      <div style={{fontSize:20,fontWeight:700,color:"#0D9488"}}>{grandTotalChats.toLocaleString()}</div>
                    </div>
                    <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #E2E8F0",boxShadow:"0 1px 3px #0001"}}>
                      <div style={{fontSize:10,color:"#065F46",fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Total Cost</div>
                      <div style={{fontSize:20,fontWeight:700,color:"#065F46"}}>฿{Math.round(rangeTotalCost).toLocaleString()}</div>
                    </div>
                    <div style={{background:"#fff",borderRadius:12,padding:"14px 18px",border:"1px solid #E2E8F0",boxShadow:"0 1px 3px #0001"}}>
                      <div style={{fontSize:10,color:"#B45309",fontWeight:600,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>Cost / Chat</div>
                      <div style={{fontSize:20,fontWeight:700,color:"#B45309"}}>฿{costPerChatAll.toFixed(2)}</div>
                    </div>
                  </div>

                  <div style={{background:"#fff",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden"}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E"}}>Cost per Chat — Brand Breakdown</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                          <button onClick={()=>setReportGroupFilter("all")} style={{padding:"3px 10px",borderRadius:6,border:"none",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:reportGroupFilter==="all"?"#0D9488":"#E2E8F0",color:reportGroupFilter==="all"?"#fff":"#64748B"}}>All</button>
                          {groups.map(g=>(
                            <button key={g} onClick={()=>setReportGroupFilter(g)} style={{padding:"3px 10px",borderRadius:6,border:"none",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:reportGroupFilter===g?"#0D9488":"#E2E8F0",color:reportGroupFilter===g?"#fff":"#64748B"}}>{g}</button>
                          ))}
                        </div>
                        <button onClick={exportChatCSV} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #06C75544",background:"#ECFDF5",color:"#065F46",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>Export Excel</button>
                      </div>
                    </div>
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                        <thead><tr style={{background:"#F8FAFC"}}>
                          {["#","Brand","Group","Platforms","Chats","Share","Cost","฿/Chat"].map(h=>(
                            <th key={h} style={{padding:"8px 12px",textAlign:["Chats","Share","Cost","฿/Chat"].includes(h)?"right":"left",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                        {brandRows.map((row,ri) => (
                          <tr key={row.b.id} style={{borderBottom:"1px solid #F1F5F9",background:ri%2===0?"#FAFBFC":"transparent"}}>
                            <td style={{padding:"8px 12px",color:"#94A3B8",fontSize:10}}>{ri+1}</td>
                            <td style={{padding:"8px 12px",fontWeight:600,color:"#1A1D2E"}}>{row.b.name}</td>
                            <td style={{padding:"8px 12px"}}><span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"#F1F5F9",color:"#94A3B8",fontWeight:600}}>{row.b.wh||"—"}</span></td>
                            <td style={{padding:"8px 12px"}}>{row.platBreakdown.map(pd=><span key={pd.plat} style={{fontSize:9,marginRight:3,padding:"1px 5px",borderRadius:4,background:"#F1F5F9",color:"#64748B",fontWeight:600}}>{pd.plat} {pd.chats.toLocaleString()}</span>)}</td>
                            <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#0D9488"}}>{row.totalBrandChats.toLocaleString()}</td>
                            <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:600,color:"#0D9488",fontSize:11}}>{(row.pct*100).toFixed(1)}%</td>
                            <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#065F46"}}>฿{row.allocatedCost.toLocaleString()}</td>
                            <td style={{padding:"8px 12px",textAlign:"right"}}><span style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:row.cpcColor,background:`${row.cpcColor}11`,padding:"2px 8px",borderRadius:6}}>฿{row.costPerChat.toFixed(2)}</span></td>
                          </tr>
                        ))}
                        <tr style={{background:"#F0FDFA",borderTop:"2px solid #0D9488"}}>
                          <td colSpan={4} style={{padding:"10px 12px",fontWeight:700,color:"#0D9488",fontSize:12}}>TOTAL</td>
                          <td style={{padding:"10px 12px",fontFamily:"monospace",fontWeight:700,color:"#0D9488",textAlign:"right",fontSize:14}}>{grandTotalChats.toLocaleString()}</td>
                          <td style={{padding:"10px 12px",fontFamily:"monospace",fontWeight:700,color:"#0D9488",textAlign:"right"}}>100%</td>
                          <td style={{padding:"10px 12px",fontFamily:"monospace",fontWeight:700,color:"#065F46",textAlign:"right",fontSize:14}}>฿{Math.round(totalCost).toLocaleString()}</td>
                          <td style={{padding:"10px 12px",fontFamily:"monospace",fontWeight:700,color:"#065F46",textAlign:"right",fontSize:13}}>฿{costPerChatAll.toFixed(2)}</td>
                        </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Daily Cost Breakdown — manager only */}
            {role!=="viewer" && <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden",marginTop:18}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E"}}>Daily Cost Breakdown</div>
                <div style={{fontSize:11,color:"#94A3B8"}}>
                  Total: <span style={{fontFamily:"monospace",fontWeight:700,color:"#0D9488"}}>฿{totalCost.toLocaleString()}</span>
                  {totalBudget>0 && <span style={{marginLeft:8,color:totalCost>totalBudget?"#F87171":"#06C755"}}>({totalBudget>0?((totalCost/totalBudget)*100).toFixed(1):0}% of budget)</span>}
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",fontFamily:"inherit",fontSize:11,width:"100%"}}>
                  <thead>
                    <tr style={{background:"#E4EAF5"}}>
                      <th style={{position:"sticky",left:0,zIndex:5,background:"#E4EAF5",padding:"6px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:100}}>Agent</th>
                      <th style={{position:"sticky",left:100,zIndex:5,background:"#E4EAF5",padding:"6px 8px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",minWidth:50,borderRight:"1px solid #E2E8F0"}}>PCode</th>
                      {dates.map(d=>{
                        const fl=flags[d.date];
                        return (
                          <th key={d.date} style={{minWidth:52,padding:"4px 2px",textAlign:"center",borderBottom:"1px solid #E2E8F0",borderRight:"1px solid #F1F5F9",fontWeight:700,background:fl?.type==="holiday"?"#FEF3C7":d.isWE?"#FFF5F5":"#E4EAF5"}}>
                            <div style={{fontSize:8,color:d.isWE||fl?.type==="holiday"?"#F87171":"#94A3B8"}}>{d.dd}/{d.mm}</div>
                            <div style={{fontSize:9,color:d.isWE||fl?.type==="holiday"?"#F87171":"#475569"}}>{d.day}</div>
                          </th>
                        );
                      })}
                      <th style={{padding:"6px 10px",textAlign:"right",borderBottom:"1px solid #E2E8F0",borderLeft:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#B45309",minWidth:80}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.filter(ag => ag.team !== "T2").map((ag,ri)=>{
                      const agCost = dates.map(d=>{
                        const v=asgn[`${ag.id}_${d.date}`];
                        if(!v||v==="Off") return 0;
                        return ag.costDay*(v==="OT"?1.5:1);
                      });
                      const agTotal = agCost.reduce((s,v)=>s+v,0);
                      const rowBg = ri%2===0?"#FAFBFC":"transparent";
                      return (
                        <tr key={ag.id} style={{borderBottom:"1px solid #F1F5F9"}}>
                          <td style={{position:"sticky",left:0,zIndex:3,background:rowBg,padding:"5px 12px",fontWeight:600,color:"#1A1D2E",minWidth:100}}>{ag.name}</td>
                          <td style={{position:"sticky",left:100,zIndex:3,background:rowBg,padding:"5px 8px",borderRight:"1px solid #E2E8F0",minWidth:50}}>
                            <span style={{fontSize:9,padding:"1px 6px",borderRadius:6,background:ALLOC_TEAM_C[ag.team]?.bg,color:ALLOC_TEAM_C[ag.team]?.color,fontWeight:700,fontFamily:"monospace"}}>{ag.id}</span>
                          </td>
                          {dates.map((d,i)=>{
                            const c = agCost[i];
                            const v = asgn[`${ag.id}_${d.date}`];
                            const fl=flags[d.date];
                            return (
                              <td key={d.date} style={{minWidth:52,padding:"3px 2px",textAlign:"center",borderRight:"1px solid #F1F5F9",background:fl?.type==="holiday"?"#F59E0B08":d.isWE?"#EE4D2D06":rowBg}}>
                                {c>0
                                  ? <span style={{fontFamily:"monospace",fontSize:9,fontWeight:700,color:"#0D9488"}}>฿{c.toLocaleString()}</span>
                                  : <span style={{fontSize:9,color:v==="Off"?"#EE4D2D33":"#E2E8F0"}}>{v==="Off"?"—":""}</span>
                                }
                              </td>
                            );
                          })}
                          <td style={{padding:"5px 10px",textAlign:"right",borderLeft:"1px solid #E2E8F0",fontFamily:"monospace",fontWeight:700,fontSize:12,color:"#F59E0B"}}>
                            ฿{agTotal.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Daily total row */}
                    <tr style={{background:"#F0FDFA",borderTop:"2px solid #0D9488"}}>
                      <td style={{position:"sticky",left:0,zIndex:3,background:"#F0FDFA",padding:"5px 12px",fontWeight:700,fontSize:10,color:"#0D9488"}}>DAILY TOTAL</td>
                      <td style={{position:"sticky",left:100,zIndex:3,background:"#F0FDFA",borderRight:"1px solid #E2E8F0"}}/>
                      {dates.map((d,i)=>(
                        <td key={d.date} style={{minWidth:52,padding:"3px 2px",textAlign:"center",borderRight:"1px solid #F1F5F9",background:"#F0FDFA"}}>
                          <span style={{fontFamily:"monospace",fontSize:9,fontWeight:700,color:dayCosts[i]>0?"#5EEAD4":"#E2E8F0"}}>
                            {dayCosts[i]>0?"฿"+dayCosts[i].toLocaleString():"—"}
                          </span>
                        </td>
                      ))}
                      <td style={{padding:"5px 10px",textAlign:"right",borderLeft:"1px solid #E2E8F0",fontFamily:"monospace",fontWeight:700,fontSize:13,color:totalCost>totalBudget?"#F87171":"#06C755"}}>฿{totalCost.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>}

            {/* ── Payment Period Summary ── */}
            {(() => {
              const prevM = payMonth === 1 ? 12 : payMonth - 1;
              const prevY = payMonth === 1 ? payYear - 1 : payYear;
              const periodStart = `${prevY}-${String(prevM).padStart(2,"0")}-24`;
              const periodEnd   = `${payYear}-${String(payMonth).padStart(2,"0")}-23`;
              const periodDates = mkDateRange(periodStart, periodEnd);
              const periodLabel = `24 ${MONTHS[prevM-1]} ${prevY} – 23 ${MONTHS[payMonth-1]} ${payYear}`;

              const periodAsgn = {...(allAsgn[periodStart.slice(0,7)]||{}), ...(allAsgn[periodEnd.slice(0,7)]||{})};
              const periodXtra = {...(allExtraHrs[periodStart.slice(0,7)]||{}), ...(allExtraHrs[periodEnd.slice(0,7)]||{})};
              const allPayRows = active.filter(a => a.team !== "T2").map(ag => {
                let workDays=0, normalDays=0, otDays=0, toilDays=0, extraH=0, extraPay=0;
                periodDates.forEach(d => {
                  const v = periodAsgn[`${ag.id}_${d.date}`];
                  if (!v || v==="Off") return;
                  if (v==="TOIL") { toilDays++; return; }
                  const e = periodXtra[`${ag.id}_${d.date}`];
                  if (e && e.h) { extraH += e.h; extraPay += e.h * (ag.costDay/8) * (e.x||1); }
                  workDays++;
                  if (v==="OT") otDays++; else normalDays++;
                });
                const totalPay = normalDays * ag.costDay + otDays * ag.costDay * 1.5 + extraPay;
                return { ag, workDays, normalDays, otDays, toilDays, extraH, extraPay, totalPay };
              });
              // Viewer sees only their own payroll — if no match, show nothing
              const payRows = role==="viewer" ? allPayRows.filter(r=>myAgent && r.ag.id===myAgent.id) : allPayRows;
              const grandTotal = payRows.reduce((s,r)=>s+r.totalPay,0);

              // Viewer with no matching agent — show instruction
              if (role==="viewer" && !myAgent) return (
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:32,textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#64748B",marginBottom:8}}>No payroll data found</div>
                  <div style={{fontSize:12,color:"#94A3B8"}}>Your login name does not match any agent. Please sign in with your agent name (e.g. "Ohm", "Joy", "Boo").</div>
                </div>
              );

              const exportPayCSV = () => {
                const rows = [["PO Number","PCode","Agent","Full Name","ID Card","Tax ID","Bank","Account Number","Account Holder","Period","Work Days","Cost/Day (฿)","Extra Hrs","Extra Pay (฿)","Total Pay (฿)","ID Card Photo","Bookbank Photo"]];
                payRows.forEach(({ag,workDays,totalPay,extraH,extraPay}) => {
                  rows.push([`${payYear}${String(payMonth).padStart(2,"0")}${ag.id}`,ag.id,ag.name,ag.fullName||ag.thaiName||"",ag.idCard||"",ag.taxId||"",ag.bankName||"",ag.bankAccount||"",ag.bankAccountName||"",periodLabel,workDays,ag.costDay,extraH||0,Math.round(extraPay||0),Math.round(totalPay),ag.idCardPhotoUrl||"",ag.bookbankPhotoUrl||""]);
                });
                rows.push(["","","","","","","","","","","TOTAL","","","",Math.round(grandTotal),"",""]);
                dlXLSX(rows, `Payment_${MONTHS[payMonth-1]}${payYear}.xlsx`);
              };

              const exportPayPDF = () => {
                const win = window.open("","_blank","width=900,height=700");
                if(!win){alert("Allow pop-ups to export PDF");return;}
                const rowsHtml = payRows.map(({ag,workDays,totalPay,extraH,extraPay})=>`
                  <tr><td style="font-weight:700">${ag.name}</td>
                  <td><span style="padding:1px 8px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace;background:${ag.team==="T1"?"#ede9fe":"#fee2e2"};color:${ag.team==="T1"?"#14b8a6":"#991b1b"}">${payYear}${String(payMonth).padStart(2,"0")}${ag.id}</span></td>
                  <td style="text-align:center">${workDays}</td>
                  <td style="text-align:right;font-family:monospace">฿${ag.costDay.toLocaleString()}</td>
                  <td style="text-align:right;font-family:monospace">${extraH>0?extraH+"h / ฿"+Math.round(extraPay).toLocaleString():"-"}</td>
                  <td style="text-align:right;font-weight:800;font-family:monospace">฿${Math.round(totalPay).toLocaleString()}</td></tr>`).join("");
                // Per-agent ID card + bookbank photo pages (only for agents with uploads)
                const photosHtml = payRows.map(({ag}) => {
                  if (!ag.idCardPhotoUrl && !ag.bookbankPhotoUrl) return "";
                  let html = "";
                  if (ag.idCardPhotoUrl) {
                    html += `
                      <div style="page-break-before:always;padding-top:20px">
                        <h2 style="font-size:14px;font-weight:700;margin-bottom:8px">${ag.name} (${ag.id}) — สำเนาบัตรประชาชน / ID Card</h2>
                        <div style="text-align:center"><img src="${ag.idCardPhotoUrl}" style="max-width:100%;max-height:650px;border:1px solid #ccc" crossorigin="anonymous"/></div>
                      </div>`;
                  }
                  if (ag.bookbankPhotoUrl) {
                    html += `
                      <div style="page-break-before:always;padding-top:20px">
                        <h2 style="font-size:14px;font-weight:700;margin-bottom:8px">${ag.name} (${ag.id}) — สำเนาสมุดบัญชี / Bookbank</h2>
                        <div style="text-align:center"><img src="${ag.bookbankPhotoUrl}" style="max-width:100%;max-height:650px;border:1px solid #ccc" crossorigin="anonymous"/></div>
                      </div>`;
                  }
                  return html;
                }).join("");
                win.document.write(`<!DOCTYPE html><html><head><title>Payment ${MONTHS[payMonth-1]} ${payYear}</title>
                  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
                  h1{font-size:16px;margin-bottom:4px}p{font-size:11px;color:#666;margin-bottom:14px}
                  table{width:100%;border-collapse:collapse}th{background:#0D9488;color:#fff;padding:7px 10px;text-align:left;font-size:10px}
                  td{padding:6px 10px;border-bottom:1px solid #eee}tr:nth-child(even) td{background:#f9f9f9}
                  .tot td{background:#ede9fe;font-weight:800;border-top:2px solid #14b8a6}
                  @media print{@page{size:A4 landscape;margin:10mm}}</style></head><body>
                  <h1>Payment Summary — ${MONTHS[payMonth-1]} ${payYear}</h1>
                  <p>Period: ${periodLabel} &nbsp;·&nbsp; ${periodDates.length} days</p>
                  <table><thead><tr><th>Agent</th><th>PO Number</th><th>Work Days</th>
                  <th style="text-align:right">Cost/Day</th><th style="text-align:right">Extra</th><th style="text-align:right">Total Pay</th></tr></thead>
                  <tbody>${rowsHtml}
                  <tr class="tot"><td colspan="5" style="padding:8px 10px">GRAND TOTAL</td>
                  <td style="text-align:right;font-family:monospace;font-size:14px">฿${Math.round(grandTotal).toLocaleString()}</td></tr>
                  </tbody></table>
                  ${photosHtml}
                  <script>
                    // Wait for all images to load before printing
                    window.onload = () => {
                      const imgs = Array.from(document.images);
                      if (imgs.length === 0) { setTimeout(()=>window.print(), 300); return; }
                      let loaded = 0;
                      const tryPrint = () => { if (++loaded >= imgs.length) setTimeout(()=>window.print(), 300); };
                      imgs.forEach(img => { if (img.complete) tryPrint(); else { img.onload = tryPrint; img.onerror = tryPrint; } });
                    };
                  <\/script></body></html>`);
                win.document.close();
              };

              return (
                <div style={{marginTop:18,background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden"}}>
                  {/* Header */}
                  <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E"}}>💰 {role==="viewer" && myAgent ? `My Payroll — ${myAgent.name}` : "Payment Period Summary"}</div>
                      <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>{periodLabel} · {periodDates.length} days</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <button onClick={()=>{let m=payMonth-1,y=payYear;if(m<1){m=12;y--;}setPayMonth(m);setPayYear(y);}}
                        style={{width:26,height:26,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                      <div style={{background:"#FAFBFC",border:"1px solid #E2E8F0",borderRadius:8,padding:"4px 14px",fontSize:12,fontWeight:700,color:"#1A1D2E",minWidth:110,textAlign:"center"}}>
                        {MONTHS[payMonth-1]} {payYear}
                      </div>
                      <button onClick={()=>{let m=payMonth+1,y=payYear;if(m>12){m=1;y++;}setPayMonth(m);setPayYear(y);}}
                        style={{width:26,height:26,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                      <div style={{width:1,background:"#E2E8F0",margin:"0 4px"}}/>
                      {role!=="viewer" && <button onClick={exportPayCSV} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #06C75544",background:"#ECFDF5",color:"#065F46",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>Excel</button>}
                      {role!=="viewer" && <button onClick={exportPayPDF} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #F87171",background:"#FFF5F5",color:"#B91C1C",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>PDF</button>}
                    </div>
                  </div>
                  {/* Table */}
                  {role==="viewer" && myAgent ? (
                    /* ── Viewer: simple personal payslip ── */
                    (() => {
                      const myRow = payRows[0];
                      if (!myRow) return <div style={{padding:24,textAlign:"center",color:"#94A3B8"}}>No payroll data for this period.</div>;
                      return (
                        <div style={{padding:"20px 24px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
                            {myRow.ag.profilePhotoUrl
                              ? <img src={myRow.ag.profilePhotoUrl} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover"}}/>
                              : <div style={{width:44,height:44,borderRadius:10,background:"#F0FDFA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#0D9488"}}>{myRow.ag.name.charAt(0)}</div>}
                            <div>
                              <div style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>{myRow.ag.name}</div>
                              <div style={{fontSize:11,color:"#94A3B8"}}><span style={{padding:"2px 8px",borderRadius:6,background:ALLOC_TEAM_C[myRow.ag.team]?.bg,color:ALLOC_TEAM_C[myRow.ag.team]?.color,fontWeight:700,fontSize:10}}>{myRow.ag.team}</span> · ฿{myRow.ag.costDay}/day</div>
                            </div>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:16}}>
                            <div style={{background:"#F0FDFA",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
                              <div style={{fontSize:24,fontWeight:700,color:"#0D9488"}}>{myRow.workDays}</div>
                              <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>Work Days</div>
                            </div>
                            <div style={{background:"#F8FAFC",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
                              <div style={{fontSize:24,fontWeight:700,color:"#64748B"}}>฿{myRow.ag.costDay.toLocaleString()}</div>
                              <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>Daily Rate</div>
                            </div>
                            <div style={{background:"#ECFDF5",borderRadius:10,padding:"14px 16px",textAlign:"center",border:"1px solid #A7F3D0"}}>
                              <div style={{fontSize:24,fontWeight:700,color:"#059669"}}>฿{Math.round(myRow.totalPay).toLocaleString()}</div>
                              <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>Total Pay</div>
                            </div>
                          </div>
                          <div style={{fontSize:10,color:"#94A3B8",textAlign:"center"}}>PO {payYear}{String(payMonth).padStart(2,"0")}{myRow.ag.id} · Period: {periodLabel} · {myRow.workDays} days × ฿{myRow.ag.costDay}{myRow.extraH > 0 ? ` + ${myRow.extraH}h extra (฿${Math.round(myRow.extraPay).toLocaleString()})` : ""} = ฿{Math.round(myRow.totalPay).toLocaleString()}</div>
                        </div>
                      );
                    })()
                  ) : (
                    /* ── Manager: full team table with bookbank ── */
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{background:"#E4EAF5"}}>
                        {["PO Number","Agent","Bank Details","Work Days","Cost/Day (฿)","Extra","Total Pay (฿)"].map(h=>(
                          <th key={h} style={{padding:"8px 12px",textAlign:["Work Days","Cost/Day (฿)","Extra","Total Pay (฿)"].includes(h)?"right":"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {["T1","Return","CC"].map(team => {
                        // FIX: sort team rows by PCode (id) ascending so the
                        // report layout matches the spreadsheet order.
                        const teamRows = payRows
                          .filter(r=>r.ag.team===team)
                          .sort((a,b) => (a.ag.id||"").localeCompare(b.ag.id||"", undefined, {numeric:true}));
                        if(!teamRows.length) return null;
                        const teamTotal = teamRows.reduce((s,r)=>s+r.totalPay,0);
                        const tc = ALLOC_TEAM_C[team];
                        return [
                          <tr key={`${team}-hdr`} style={{background:tc.bg+"44"}}>
                            <td colSpan={7} style={{padding:"5px 12px",fontSize:10,fontWeight:700,color:tc.color,letterSpacing:1}}>{team} — Daily Rate × Worked Days</td>
                          </tr>,
                          ...teamRows.map(({ag,workDays,normalDays,totalPay,extraH,extraPay},ri) => {
                            const fullName = ag.fullName || ag.name;
                            const bankLabel = ag.bankName || ag.bank || "";
                            const bankAcct = ag.bankAccount || "";
                            const bankHolder = ag.bankAccountName || "";
                            const hasBank = bankLabel || bankAcct || bankHolder;
                            return (
                            <tr key={ag.id} style={{borderBottom:"1px solid #F1F5F9",background:ri%2===0?"#FAFBFC":"transparent"}}>
                              <td style={{padding:"8px 12px"}}>
                                <span title="PO number: pay month + PCode" style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:ALLOC_TEAM_C[team]?.bg,color:ALLOC_TEAM_C[team]?.color,fontWeight:700,fontFamily:"monospace"}}>{payYear}{String(payMonth).padStart(2,"0")}{ag.id}</span>
                              </td>
                              <td style={{padding:"8px 12px"}}>
                                <div style={{fontWeight:700,color:"#1A1D2E"}}>{fullName}</div>
                                {fullName !== ag.name && <div style={{fontSize:10,color:"#94A3B8",marginTop:1}}>({ag.name})</div>}
                              </td>
                              <td style={{padding:"8px 12px",fontSize:11,color:"#64748B"}}>{hasBank ? (
                                <div>
                                  {bankLabel && <div style={{fontWeight:600,color:"#1A1D2E"}}>{bankLabel}</div>}
                                  {bankAcct && <div style={{fontFamily:"monospace",fontSize:10,color:"#475569"}}>{bankAcct}</div>}
                                  {bankHolder && <div style={{fontSize:10,color:"#94A3B8"}}>{bankHolder}</div>}
                                </div>
                              ) : <span style={{color:"#CBD5E1"}}>—</span>}</td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,color:"#0D9488",textAlign:"right"}}>{workDays}</td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#94A3B8",textAlign:"right"}}>฿{ag.costDay.toLocaleString()}</td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:11,color:"#B45309",textAlign:"right"}}>{extraH>0 ? (extraH+"h · ฿"+Math.round(extraPay).toLocaleString()) : <span style={{color:"#E2E8F0"}}>—</span>}</td>
                              <td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,fontSize:14,color:"#065F46",textAlign:"right"}}>฿{Math.round(totalPay).toLocaleString()}</td>
                            </tr>
                            );
                          }),
                          <tr key={`${team}-sub`} style={{background:tc.bg+"22",borderTop:`1px solid ${tc.color}44`}}>
                            <td colSpan={6} style={{padding:"6px 12px",fontWeight:700,color:tc.color,fontSize:11}}>{team} SUBTOTAL</td>
                            <td style={{padding:"6px 12px",fontFamily:"monospace",fontWeight:700,color:tc.color,textAlign:"right"}}>฿{Math.round(teamTotal).toLocaleString()}</td>
                          </tr>
                        ];
                      })}
                      <tr style={{background:"#F0FDFA",borderTop:"2px solid #0D9488"}}>
                        <td colSpan={6} style={{padding:"12px 12px",fontWeight:700,color:"#0D9488",fontSize:13}}>GRAND TOTAL</td>
                        <td style={{padding:"12px 12px",fontFamily:"monospace",fontWeight:700,fontSize:16,color:"#065F46",textAlign:"right"}}>฿{Math.round(grandTotal).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════
            VOLUME TAB — Monthly Chat Volume Data Entry
        ══════════════════════════════════════════ */}
        {allocTab==="volume" && (() => {
          const mk      = volKey(volYear, volMonth);
          const prevM   = volMonth===1 ? 12 : volMonth-1;
          const prevY   = volMonth===1 ? volYear-1 : volYear;
          const prevMk  = volKey(prevY, prevM);
          const hasPrev = !!monthlyVol[prevMk];

          // Platforms that are actually used by at least one brand
          const activePlats = PLATFORMS.filter(p => brands.some(b=>(b.platforms||[]).includes(p)));

          // Column totals
          const platTotals = {};
          activePlats.forEach(p => {
            platTotals[p] = brands.reduce((s,b)=>(b.platforms||[]).includes(p)?s+getVol(b.id,p):s, 0);
          });
          const grandTotal = Object.values(platTotals).reduce((s,v)=>s+v,0);

          return (
            <div>
              {/* Header controls */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:"#94A3B8",fontWeight:700}}>Month:</span>
                  <button onClick={()=>{let m=volMonth-1,y=volYear;if(m<1){m=12;y--;}setVolMonth(m);setVolYear(y);}}
                    style={{width:26,height:26,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                  <div style={{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,color:"#1A1D2E",minWidth:110,textAlign:"center"}}>
                    {MONTHS[volMonth-1]} {volYear}
                  </div>
                  <button onClick={()=>{let m=volMonth+1,y=volYear;if(m>12){m=1;y++;}setVolMonth(m);setVolYear(y);}}
                    style={{width:26,height:26,borderRadius:6,border:"1px solid #E2E8F0",background:"transparent",color:"#0D9488",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                  {hasPrev && (
                    <button onClick={()=>{
                      // Copy all values from previous month into current month
                      setMonthlyVol(prev=>{
                        const copied = {};
                        brands.forEach(b=>{
                          copied[b.id]={};
                          PLATFORMS.forEach(p=>{copied[b.id][p]=getVol(b.id,p,prevY,prevM);});
                        });
                        const newState = {...prev,[mk]:{...(prev[mk]||{}),...copied}};
                        // Sync into brands
                        setBrands(bs=>bs.map(b=>({...b,chats:{...copied[b.id]}})));
                        return newState;
                      });
                    }} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #E2E8F0",background:"transparent",color:"#1D4ED8",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                      Copy from {MONTHS[prevM-1]}
                    </button>
                  )}
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{fontSize:11,color:"#94A3B8"}}>
                    Total: <span style={{fontFamily:"monospace",fontWeight:700,color:"#B45309",fontSize:14}}>{grandTotal.toLocaleString()}</span> chats
                  </div>
                  {/* Import file — using visible input for sandbox compatibility */}
                  <div style={{position:"relative",display:"inline-block"}}>
                    <input type="file" accept=".csv,.txt,.json,.xlsx,.xls"
                      style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%",zIndex:2}}
                      onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if(!file) return;
                      // ── Parse CSV ────────────────────────────────────────────
                      const parseCSVText = (text) => {
                        const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l=>l.trim());
                        const parseRow = line => {
                          const cells=[]; let cur="", inQ=false;
                          for(let i=0;i<line.length;i++){
                            const c=line[i];
                            if(c==='"') inQ=!inQ;
                            else if(c===','&&!inQ){ cells.push(cur.trim().replace(/^"|"$/g,'')); cur=""; }
                            else cur+=c;
                          }
                          cells.push(cur.trim().replace(/^"|"$/g,'')); return cells;
                        };
                        return lines.map(parseRow);
                      };

                      // ── Process rows (shared logic for CSV & XLSX) ──────────
                      const processRows = (rows) => {
                        if(rows.length < 2){ alert("File appears empty or has no data rows."); return; }

                        const storeKeywords = ["store name","store","brand","shop name","shop"];
                        const platKeywords  = ["marketplace","platform","channel","market"];
                        const chatsKeywords = ["chats","chat","# of chat","total chat","message","messeg","msg","inbox"];

                        let hdrIdx = rows.findIndex(r =>
                          r.some(c => storeKeywords.some(k => String(c).toLowerCase().includes(k)))
                        );
                        if(hdrIdx < 0) hdrIdx = 0;

                        const hdr = rows[hdrIdx].map(c => String(c).toLowerCase().trim().replace(/"/g,''));
                        const storeCol = hdr.findIndex(h => storeKeywords.some(k => h.includes(k)));
                        const platCol  = hdr.findIndex(h => platKeywords.some(k => h.includes(k)));
                        // ONLY use the "Replied Chats" column for chat counts.
                        // The inquiry "Chats" column is intentionally ignored.
                        const repliedCol = hdr.findIndex(h => h.includes("replied chat"));
                        const custCol    = hdr.findIndex(h => h==="customers" || h.includes("customer"));
                        const avgRespCol = hdr.findIndex(h => h.includes("avg first resp") || h.includes("first response"));
                        const convCol    = hdr.findIndex(h => h.includes("conversion"));
                        const amountCol  = hdr.findIndex(h => h.includes("order amount") || h.includes("guide order amount"));
                        const ratingCol  = hdr.findIndex(h => h.includes("store rating") || h.includes("rating"));

                        if(storeCol<0 || platCol<0 || repliedCol<0){
                          alert(`Could not detect required columns.\n\nFound: ${hdr.filter(Boolean).slice(0,10).join(" | ")}\n\nNeed columns for: Store/Brand, Platform/Marketplace, and "Replied Chats".\n\nThe inquiry "Chats" column is intentionally ignored — only "Replied Chats" is used.`);
                          return;
                        }

                        const normPlat = raw => {
                          const s = String(raw||"").toLowerCase().trim();
                          if(s.includes("shopee"))  return "Shopee";
                          if(s.includes("lazada"))  return "Lazada";
                          if(s.includes("tiktok")||s.includes("tik tok")) return "Tiktok";
                          if(s.includes("line")||s.includes("myshop")||s.includes("my shop")) return "Line MyShop";
                          if(s.includes("amaze"))   return "Amaze";
                          if(s.includes("brand.com")||s.includes("brandcom")||s.includes("brand com")) return "Brand.com";
                          return s.charAt(0).toUpperCase()+s.slice(1);
                        };

                        const parseNum = v => Number(String(v||"").replace(/[^0-9.]/g,""))||0;

                        const agg = {};
                        const perfAgg = {}; // storeName → platform → {chats, replied, inquiry, customers, avgResp, conv, amount, rating}
                        rows.slice(hdrIdx+1).forEach(r => {
                          const store = String(r[storeCol]||"").trim().replace(/"/g,'');
                          const plat  = normPlat(r[platCol]);
                          // Only read from the "Replied Chats" column. Inquiry chats are ignored.
                          const chats = parseNum(r[repliedCol]);
                          if(!store || !plat) return;
                          if(!agg[store]) agg[store]={};
                          agg[store][plat] = (agg[store][plat]||0) + chats;
                          // Performance data
                          if(!perfAgg[store]) perfAgg[store]={};
                          perfAgg[store][plat.toLowerCase()] = {
                            chats,
                            customers: custCol>=0 ? parseNum(r[custCol]) : 0,
                            avgResp: avgRespCol>=0 ? parseNum(r[avgRespCol]) : 0,
                            conv: convCol>=0 ? parseNum(r[convCol]) : 0,
                            amount: amountCol>=0 ? parseNum(r[amountCol]) : 0,
                            rating: ratingCol>=0 ? String(r[ratingCol]||"").replace(/[^0-9.%]/g,"") : null,
                          };
                        });

                        if(!Object.keys(agg).length){ alert("No data rows found. Check that the file has Store Name, Marketplace, and Chats columns."); return; }

                        const normalise = s => s.toLowerCase().replace(/[^a-z0-9]/g,"");
                        let matched=0; const newBrands=[];
                        const updatedBrands = [...brands];

                        Object.entries(agg).forEach(([storeName, platChats])=>{
                          // Skip closed/offboarded stores
                          const lower = storeName.toLowerCase();
                          if(lower.startsWith("closed") || lower.startsWith("offboarded")) return;

                          const norm = normalise(storeName);
                          let idx = updatedBrands.findIndex(b=>normalise(b.name)===norm);
                          if(idx<0) idx = updatedBrands.findIndex(b=>norm.includes(normalise(b.name))||normalise(b.name).includes(norm));
                          if(idx>=0){
                            const plats = [...new Set([...(updatedBrands[idx].platforms||[]),...Object.keys(platChats).filter(p=>platChats[p]>0)])];
                            const newPerf = {...(updatedBrands[idx].perf||{}), ...(perfAgg[storeName]||{})};
                            // FIX: do NOT overwrite brands[].chats globally on import. The
                            // imported numbers belong to the SPECIFIC month being imported,
                            // not to the brand globally. Previously, the chats overwrite
                            // here caused every month's display to inherit the last-imported
                            // month's values (because getVol fell back to brands.chats).
                            // The per-month data is stored in monthlyVol[mk] below; this
                            // brand record just gets platform/perf metadata updates.
                            updatedBrands[idx] = {...updatedBrands[idx], platforms:plats, perf:newPerf};
                            matched++;
                          } else {
                            const plats = Object.keys(platChats); // include zero-chat platforms: a store in the Duoke file is a live store
                            if(plats.length>0){
                              // For brand-new brands (not yet in roster), seed chats from
                              // the import so allocation has SOMETHING to work with. This
                              // is a one-time bootstrap — subsequent re-imports won't
                              // touch chats again (see existing-brand branch above).
                              newBrands.push({
                                id:`imp${Date.now()}${Math.random().toString(36).slice(2,6)}`,
                                name:storeName, group: storeName.includes("-") ? storeName.split("-").pop().trim() : "", wh: storeName.includes("-") ? storeName.split("-").pop().trim() : "",
                                platforms:plats, perf:perfAgg[storeName]||{},
                                chats:{...Object.fromEntries(PLATFORMS.map(p=>[p,0])),...platChats}
                              });
                            }
                          }
                        });

                        setBrands([...updatedBrands,...newBrands]);
                        // monthlyVol gets the import's per-month chat data.
                        // Pull chats directly from the imported `agg` (not from brands.chats)
                        // since we no longer overwrite brands.chats above.
                        // FIX (round-7 senior review HIGH): `agg` is keyed by the file's literal
                        // storeName (e.g. "Crocs-CMG"). Existing brands may have a slightly
                        // different stored name (case/whitespace). The match loop above used
                        // `normalise()` to find them, but the lookup here was using `b.name`
                        // directly — so any case/punctuation mismatch silently wrote zeros.
                        // Now we build a parallel normalised lookup table.
                        const aggByNorm = {};
                        for (const [storeName, platChats] of Object.entries(agg)) {
                          aggByNorm[normalise(storeName)] = platChats;
                        }
                        setMonthlyVol(prev=>{
                          const newVol = {...(prev[mk] || {})};
                          [...updatedBrands,...newBrands].forEach(b=>{
                            const importChats = aggByNorm[normalise(b.name)] || agg[b.name] || {};
                            // Use the import's per-platform chats, falling back to brand's
                            // existing chats only for brand-new brands (the bootstrap path).
                            const isNewBrand = newBrands.some(nb => nb.id === b.id);
                            const source = isNewBrand ? (b.chats || {}) : importChats;
                            newVol[b.id] = Object.fromEntries(PLATFORMS.map(p=>[p, source[p] || 0]));
                          });
                          return {...prev,[mk]:newVol};
                        });
                        const skipped = Object.keys(agg).filter(s=>s.toLowerCase().startsWith("closed")||s.toLowerCase().startsWith("offboarded")).length;
                        alert(`Import successful!\n• Chat count from "Replied Chats" column\n• ${matched} brands updated\n• ${newBrands.length} new brands added\n• ${skipped} closed/offboarded stores skipped\n• ${Object.keys(agg).length} total stores in file`+(newBrands.length?`\n\nNew brands created:\n${newBrands.slice(0,15).map(b=>"  - "+b.name).join("\n")}${newBrands.length>15?`\n  ...and ${newBrands.length-15} more`:""}`:""));
                      };

                      const isJSON  = file.name.match(/\.json$/i);
                      const isExcel = file.name.match(/\.xlsx?$/i);

                      // Helper: parse an xlsx ArrayBuffer to rows via SheetJS.
                      // Lazy-imports xlsx so the bundle only pays the cost when actually needed.
                      const handleXLSX = async (buf) => {
                        try {
                          const XLSX = await import("xlsx");
                          const wb = XLSX.read(buf, { type: "array" });
                          // Use first sheet by default
                          const ws = wb.Sheets[wb.SheetNames[0]];
                          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
                          // Strip fully-empty trailing rows so processRows hits the right empty-check
                          while (rows.length && rows[rows.length-1].every(c => c === "" || c == null)) rows.pop();
                          if (rows.length < 2) { alert("File appears empty or has no data rows."); return; }
                          processRows(rows);
                        } catch (err) {
                          alert("XLSX import failed: " + err.message);
                        }
                      };

                      // Read file as ArrayBuffer first so we can detect XLSX by magic bytes,
                      // catching cases where someone renamed a .xlsx to .csv.
                      const sniff = new FileReader();
                      sniff.onload = (evt) => {
                        const buf = evt.target.result;
                        const u8 = new Uint8Array(buf);
                        // ZIP magic = 0x50 0x4B 0x03 0x04  ("PK\x03\x04")
                        const looksZip = u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04;
                        if (isExcel || looksZip) { handleXLSX(buf); return; }
                        // Otherwise fall through to text-based paths below.
                        const text = new TextDecoder("utf-8").decode(u8);
                        if (isJSON) { handleJSONText(text); return; }
                        handleCSVText(text);
                      };
                      sniff.onerror = () => alert("Could not read the file.");
                      sniff.readAsArrayBuffer(file);

                      // ── Helper: parse Duoke JSON text ──────────────────
                      const handleJSONText = (text) => {
                        try {
                          const allMonths = JSON.parse(text);
                          let totalStores = 0, monthCount = 0;
                          const updBrands = [...brands];
                          const updVol = {};
                          const normalise = s => s.toLowerCase().replace(/[^a-z0-9]/g,"");
                          const normPlat = p => {const s=String(p).toLowerCase();return s.includes("shopee")?"Shopee":s.includes("lazada")?"Lazada":s.includes("tiktok")?"Tiktok":s.includes("line")||s.includes("myshop")?"Line MyShop":s.includes("amaze")?"Amaze":s.includes("brand.com")||s.includes("brandcom")?"Brand.com":s.charAt(0).toUpperCase()+s.slice(1);};

                          const nameMap = {};
                          updBrands.forEach((b,i) => { nameMap[normalise(b.name)] = i; });
                          const findBrand = (storeName) => {
                            const norm = normalise(storeName);
                            if (nameMap[norm] !== undefined) return nameMap[norm];
                            for (let i=0; i<updBrands.length; i++) {
                              const bn = normalise(updBrands[i].name);
                              if (bn.length >= 6 && norm.length >= 6 && (norm.includes(bn) || bn.includes(norm))) return i;
                            }
                            return -1;
                          };

                          const allStores = new Set();
                          for (const rows of Object.values(allMonths)) {
                            rows.forEach(r => {
                              const store = r.s || r.shopName || "";
                              if (store && !store.toLowerCase().startsWith("closed") && !store.toLowerCase().startsWith("offboarded")) allStores.add(store);
                            });
                          }
                          allStores.forEach(store => {
                            if (findBrand(store) < 0) {
                              const newId = "imp" + Date.now() + Math.random().toString(36).slice(2,6);
                              const idx = updBrands.length;
                              updBrands.push({ id:newId, name:store, group:"", wh:store.includes("-")?store.split("-").pop().trim():"", platforms:[], perf:{}, chats:Object.fromEntries(PLATFORMS.map(p=>[p,0])) });
                              nameMap[normalise(store)] = idx;
                            }
                          });

                          const sortedMonths = Object.keys(allMonths).sort();
                          for (const monthKey of sortedMonths) {
                            monthCount++;
                            const rows = allMonths[monthKey];
                            const volForMonth = {};
                            updBrands.forEach(b => { volForMonth[b.id] = Object.fromEntries(PLATFORMS.map(p=>[p,0])); });
                            rows.forEach(r => {
                              const store = r.s || r.shopName || "";
                              const plat = normPlat(r.p || r.platform || "");
                              const chats = r.c || r.conversationNum || 0;
                              if (!store || !plat || store.toLowerCase().startsWith("closed") || store.toLowerCase().startsWith("offboarded")) return;
                              const idx = findBrand(store);
                              if (idx >= 0) {
                                const bid = updBrands[idx].id;
                                volForMonth[bid][plat] = (volForMonth[bid][plat]||0) + chats;
                                if (chats > 0 && !(updBrands[idx].platforms||[]).includes(plat)) updBrands[idx] = {...updBrands[idx], platforms:[...(updBrands[idx].platforms||[]),plat]};
                                updBrands[idx] = {...updBrands[idx], perf:{...(updBrands[idx].perf||{}), [plat.toLowerCase()]:{chats, replied:r.rc||0, customers:r.cu||0, avgResp:r.afr||0, conv:r.cr||0, amount:r.loa||0, rating:r.rt}}};
                              }
                              totalStores++;
                            });
                            updVol[monthKey] = volForMonth;
                          }

                          const latestMk = sortedMonths[sortedMonths.length-1];
                          const latestVol = updVol[latestMk] || {};
                          const finalBrands = updBrands.map(b => ({...b, chats: latestVol[b.id] || b.chats}));
                          setBrands(finalBrands);
                          setMonthlyVol(prev => ({...prev, ...updVol}));

                          const dbg = sortedMonths.map(mk => {
                            const vol = updVol[mk];
                            const tc = vol ? Object.values(vol).reduce((s,v)=>s+Object.values(v).reduce((a,b)=>a+b,0),0) : 0;
                            return mk + ": " + tc.toLocaleString();
                          }).join("\n");
                          alert("Duoke JSON imported!\n\n" + monthCount + " months (" + sortedMonths[0] + " > " + latestMk + ")\n" + finalBrands.length + " brands\n\nChats per month:\n" + dbg);
                        } catch(err) { alert("JSON import failed: " + err.message); }
                      };

                      // ── Helper: parse CSV text ────────────────────────────
                      const handleCSVText = (text) => {
                        try {
                          const rows = parseCSVText(text);
                          if (rows.length >= 2) { processRows(rows); }
                          else { alert("File appears empty or has no data rows."); }
                        } catch(err) { alert("CSV import failed: " + err.message); }
                      };
                    }}/>
                    <div style={{padding:"5px 12px",borderRadius:7,border:"1px solid #34D39944",background:"#ECFDF5",color:"#065F46",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",position:"relative",zIndex:1,pointerEvents:"none"}}>
                      Import
                    </div>
                  </div>
                  <button onClick={()=>{
                    setMonthlyVol(prev=>{const n={...prev};delete n[mk];return n;});
                    setBrands(bs=>bs.map(b=>({...b,chats:Object.fromEntries(PLATFORMS.map(p=>[p,0]))})));
                  }} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #E2E8F0",background:"transparent",color:"#6B7280",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    Clear Month
                  </button>
                  <button onClick={()=>{
                    const newId=`b${String(brands.length+1).padStart(2,"0")}${Date.now().toString(36).slice(-3)}`;
                    setEditBrand({id:newId,name:"",group:"",wh:"",platforms:[],chats:{}});
                    setBrandModal(true);
                  }} style={{padding:"5px 12px",borderRadius:7,border:"none",background:"#0D9488",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    + Add Brand
                  </button>
                </div>
              </div>

              {/* Volume grid */}
              <div style={{background:"#FFFFFF",borderRadius:14,border:"1px solid #F1F5F9",overflow:"hidden"}}>
                {/* View toggle */}
                <div style={{padding:"10px 16px",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:3,background:"#FAFBFC",borderRadius:8,padding:3}}>
                    {[["chats","Chat Volume"],["perf","Performance"]].map(([m,l])=>(
                      <button key={m} onClick={()=>setVolViewMode(m)} style={{
                        padding:"5px 12px",border:"none",cursor:"pointer",fontSize:11,fontWeight:600,borderRadius:6,fontFamily:"inherit",
                        background:volViewMode===m?"#F0FDFA":"transparent",
                        color:volViewMode===m?"#5EEAD4":"#94A3B8",
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{overflowX:"auto"}}>
                  {volViewMode==="chats" ? (
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{background:"#E4EAF5",position:"sticky",top:0,zIndex:10}}>
                        <th style={{padding:"10px 14px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:180,position:"sticky",left:0,background:"#E4EAF5",zIndex:11}}>Brand</th>
                        <th style={{padding:"10px 12px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:60}}>Group</th>
                        {activePlats.map(p=>{
                          const pc=PLATFORM_C[p];
                          return (
                            <th key={p} style={{padding:"10px 12px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:pc.color,textTransform:"uppercase",minWidth:110,borderLeft:"1px solid #F1F5F9"}}>
                              {pc.icon} {p}
                            </th>
                          );
                        })}
                        <th style={{padding:"10px 12px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#B45309",textTransform:"uppercase",minWidth:90,borderLeft:"1px solid #E2E8F0"}}>Total</th>
                        {hasPrev && <th style={{padding:"10px 12px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:90,borderLeft:"1px solid #F1F5F9"}}>vs {MONTHS[prevM-1]}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {brands.map((b, bi) => {
                        const rowTotal = activePlats.reduce((s,p)=>(b.platforms||[]).includes(p)?s+getVol(b.id,p):s, 0);
                        const prevTotal = hasPrev ? activePlats.reduce((s,p)=>(b.platforms||[]).includes(p)?s+getVol(b.id,p,prevY,prevM):s, 0) : 0;
                        const diff = rowTotal - prevTotal;
                        const rowBg = bi%2===0 ? "#FAFBFC" : "transparent";
                        return (
                          <tr key={b.id} style={{borderBottom:"1px solid #F1F5F9",background:rowBg}}>
                            <td style={{padding:"6px 14px",fontWeight:600,color:"#1A1D2E",position:"sticky",left:0,background:rowBg,zIndex:1,borderRight:"1px solid #F1F5F9"}}>
                              {b.name}
                            </td>
                            <td style={{padding:"6px 10px"}}>
                              <input
                                value={b.wh || ""}
                                placeholder="—"
                                onChange={e => { const v = e.target.value; setBrands(bs => bs.map(x => x.id === b.id ? {...x, wh: v} : x)); }}
                                title="Click to edit group"
                                style={{width:60, padding:"3px 8px", borderRadius:5, background:"#F1F5F9", color:"#475569", fontSize:10, fontWeight:600, border:"1px solid transparent", outline:"none", textAlign:"center", fontFamily:"inherit"}}
                              />
                            </td>
                            {activePlats.map(p => {
                              const pc = PLATFORM_C[p];
                              const isActive = (b.platforms||[]).includes(p);
                              const val = isActive ? getVol(b.id, p) : null;
                              const prevVal = isActive && hasPrev ? getVol(b.id, p, prevY, prevM) : null;
                              const platDiff = (val!=null && prevVal!=null) ? val-prevVal : null;
                              return (
                                <td key={p} style={{padding:"4px 8px",borderLeft:"1px solid #F1F5F9",textAlign:"right"}}>
                                  {isActive ? (
                                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                                      <input type="number" min="0" value={val} onChange={e=>setVol(b.id, p, e.target.value)}
                                        style={{width:88, padding:"5px 8px", borderRadius:6, textAlign:"right",
                                          border:`1px solid ${val>0?pc.color+"55":"#E2E8F0"}`,
                                          background: val>0 ? pc.bg : "#FFFFFF",
                                          color: val>0 ? pc.color : "#94A3B8",
                                          fontSize:12, fontFamily:"monospace", fontWeight:700, outline:"none"}}/>
                                      {hasPrev && platDiff!==null && (
                                        <span style={{fontSize:9,color:platDiff>0?"#34D399":platDiff<0?"#F87171":"#94A3B8",fontFamily:"monospace"}}>
                                          {platDiff>0?"+":""}{platDiff.toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                  ) : <span style={{color:"#F1F5F9"}}>—</span>}
                                </td>
                              );
                            })}
                            <td style={{padding:"6px 12px",textAlign:"right",borderLeft:"1px solid #E2E8F0"}}>
                              <span style={{fontFamily:"monospace",fontWeight:700,fontSize:13,color:"#B45309"}}>{rowTotal.toLocaleString()}</span>
                            </td>
                            {hasPrev && (
                              <td style={{padding:"6px 12px",textAlign:"right",borderLeft:"1px solid #F1F5F9"}}>
                                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                                  <span style={{fontFamily:"monospace",fontWeight:700,fontSize:12,color:diff>0?"#34D399":diff<0?"#F87171":"#94A3B8"}}>
                                    {diff>0?"+":""}{diff.toLocaleString()}
                                  </span>
                                  {prevTotal>0 && <span style={{fontSize:9,color:"#94A3B8"}}>{((diff/prevTotal)*100).toFixed(1)}%</span>}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#F0FDFA",borderTop:"2px solid #0D9488"}}>
                        <td style={{padding:"10px 14px",fontWeight:700,color:"#0D9488",fontSize:11,position:"sticky",left:0,background:"#F0FDFA"}}>TOTAL</td>
                        <td/>
                        {activePlats.map(p=>(
                          <td key={p} style={{padding:"10px 12px",textAlign:"right",borderLeft:"1px solid #E2E8F0",fontFamily:"monospace",fontWeight:700,fontSize:13,color:PLATFORM_C[p].color}}>
                            {platTotals[p].toLocaleString()}
                          </td>
                        ))}
                        <td style={{padding:"10px 12px",textAlign:"right",borderLeft:"1px solid #E2E8F0",fontFamily:"monospace",fontWeight:700,fontSize:14,color:"#B45309"}}>
                          {grandTotal.toLocaleString()}
                        </td>
                        {hasPrev && (() => {
                          const prevGrand = brands.reduce((s,b)=>s+activePlats.reduce((ss,p)=>(b.platforms||[]).includes(p)?ss+getVol(b.id,p,prevY,prevM):ss,0),0);
                          const gDiff = grandTotal-prevGrand;
                          return (
                            <td style={{padding:"10px 12px",textAlign:"right",borderLeft:"1px solid #E2E8F0",fontFamily:"monospace",fontWeight:700,fontSize:12,color:gDiff>0?"#34D399":gDiff<0?"#F87171":"#94A3B8"}}>
                              {gDiff>0?"+":""}{gDiff.toLocaleString()}
                              {prevGrand>0&&<div style={{fontSize:9,color:"#94A3B8",fontWeight:400}}>{((gDiff/prevGrand)*100).toFixed(1)}%</div>}
                            </td>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  </table>
                  ) : (
                  /* ── Performance view ── */
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead>
                      <tr style={{background:"#E4EAF5",position:"sticky",top:0,zIndex:10}}>
                        <th style={{padding:"8px 14px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:180,position:"sticky",left:0,background:"#E4EAF5",zIndex:11}}>Brand</th>
                        <th style={{padding:"8px 10px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",minWidth:50}}>Mkt</th>
                        <th style={{padding:"8px 10px",textAlign:"left",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",minWidth:50}}>Platform</th>
                        <th style={{padding:"8px 10px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#1D4ED8",minWidth:70}}>Chats</th>
                        <th style={{padding:"8px 10px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#B45309",minWidth:90}}>Avg 1st Resp</th>
                        <th style={{padding:"8px 10px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#EE4D2D",minWidth:80}}>Conv %</th>
                        <th style={{padding:"8px 10px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#065F46",minWidth:110}}>Order Amt (฿)</th>
                        <th style={{padding:"8px 10px",textAlign:"right",borderBottom:"1px solid #E2E8F0",fontSize:10,fontWeight:700,color:"#94A3B8",minWidth:70}}>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brands.filter(b=>b.perf && Object.keys(b.perf).length>0).map((b,bi) => {
                        const rows = Object.entries(b.perf).filter(([,p])=>p.chats>0);
                        if(!rows.length) return null;
                        const rowBg = bi%2===0?"#FAFBFC":"transparent";
                        return rows.map(([mkt, p], ri) => {
                          const pc = PLATFORM_C[mkt.charAt(0).toUpperCase()+mkt.slice(1)];
                          const isFirst = ri===0;
                          return (
                            <tr key={`${b.id}_${mkt}`} style={{borderBottom:"1px solid #F1F5F9",background:rowBg}}>
                              {isFirst && (
                                <td rowSpan={rows.length} style={{padding:"8px 14px",fontWeight:600,color:"#1A1D2E",position:"sticky",left:0,background:rowBg,zIndex:1,borderRight:"1px solid #F1F5F9",verticalAlign:"top",paddingTop:10}}>
                                  <div>{b.name}</div>
                                  <div style={{fontSize:9,color:"#94A3B8",marginTop:2}}>{b.wh}</div>
                                </td>
                              )}
                              <td style={{padding:"6px 10px"}}>
                                <span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:"#F1F5F9",color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>{b.wh}</span>
                              </td>
                              <td style={{padding:"6px 10px"}}>
                                {pc ? <span style={{fontSize:10,padding:"2px 6px",borderRadius:5,background:pc.bg,color:pc.color,fontWeight:700}}>{pc.icon} {mkt}</span>
                                     : <span style={{color:"#94A3B8",fontSize:10}}>{mkt}</span>}
                              </td>
                              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:"#1D4ED8"}}>{p.chats.toLocaleString()}</td>
                              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",color:p.avgResp==null?"#94A3B8":p.avgResp<=5?"#34D399":p.avgResp<=15?"#F59E0B":"#F87171"}}>
                                {p.avgResp!=null ? `${p.avgResp} min` : "—"}
                              </td>
                              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:p.conv>=12?"#34D399":p.conv>=6?"#F59E0B":"#F87171"}}>
                                {p.conv>0?`${p.conv}%`:"—"}
                              </td>
                              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",color:"#065F46",fontWeight:p.amount>500000?800:400}}>
                                {p.amount>0?`฿${p.amount.toLocaleString()}`:"—"}
                              </td>
                              <td style={{padding:"6px 10px",textAlign:"right",fontFamily:"monospace",color:p.rating&&Number(p.rating)>=95?"#34D399":p.rating&&Number(p.rating)>0?"#F59E0B":"#94A3B8"}}>
                                {p.rating&&Number(p.rating)>0?`${p.rating}%`:"—"}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                  )}
                </div>
              </div>
              <div style={{marginTop:10,fontSize:10,color:"#94A3B8"}}>
                Values here update the chat volumes used in Allocation auto-assign and the Auto-Fill chat-per-agent constraint. Navigate months to build MoM history.
              </div>

              {/* ── Agent Performance section ───────────────────────────────────── */}
              {(() => {
                const perfMk = mk;
                const monthAgentData = agentPerf[perfMk] || {};
                const t1Agents = agents.filter(a => a.active && a.team === "T1");
                const allChats = t1Agents.reduce((s, a) => s + (monthAgentData[a.name.toLowerCase()]?.replied || 0), 0);
                return (
                  <div style={{marginTop:24,background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",overflow:"hidden"}}>
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1A1D2E"}}>
                        Agent Performance — {MONTHS[volMonth-1]} {volYear}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{fontSize:11,color:"#94A3B8"}}>
                          Total: <span style={{fontFamily:"monospace",fontWeight:700,color:"#0D9488",fontSize:13}}>{allChats.toLocaleString()}</span> replied chats
                        </div>
                        {role==="manager" && (
                          <div style={{position:"relative",display:"inline-block"}}>
                            <input type="file" accept=".csv,.txt,.json,.xlsx,.xls"
                              style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%",zIndex:2}}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                const parseRows = async () => {
                                  const isExcel = /\.xlsx?$/i.test(file.name);
                                  if (isExcel) {
                                    const XLSX = await import("xlsx");
                                    const buf = await file.arrayBuffer();
                                    const wb = XLSX.read(buf, { type: "array" });
                                    const ws = wb.Sheets[wb.SheetNames[0]];
                                    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
                                  }
                                  const text = await file.text();
                                  return text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l=>l.trim())
                                    .map(line => line.split(",").map(c => c.trim().replace(/^"|"$/g,"")));
                                };
                                let rows = await parseRows();
                                while (rows.length && rows[rows.length-1].every(c => c==="" || c==null)) rows.pop();
                                if (rows.length < 2) { alert("File appears empty or has no data rows."); return; }
                                // Find header row + columns
                                const nameKeywords = ["agent","name","staff","employee","user"];
                                const repliedKeywords = ["replied chat","replied chats","replied","reply"];
                                let hdrIdx = rows.findIndex(r => r.some(c => nameKeywords.some(k => String(c).toLowerCase().includes(k))));
                                if (hdrIdx < 0) hdrIdx = 0;
                                const hdr = rows[hdrIdx].map(c => String(c).toLowerCase().trim());
                                const repliedCol = hdr.findIndex(h => repliedKeywords.some(k => h.includes(k)));
                                const nameCol = hdr.findIndex(h => nameKeywords.some(k => h.includes(k)));
                                if (nameCol < 0 || repliedCol < 0) {
                                  alert(`Could not detect columns.\n\nFound: ${hdr.filter(Boolean).slice(0,8).join(" | ")}\n\nNeed columns for: Agent/Name, Replied Chats`);
                                  return;
                                }
                                const parseNum = v => Number(String(v||"").replace(/[^0-9.]/g,""))||0;
                                const newData = {};
                                rows.slice(hdrIdx+1).forEach(r => {
                                  const name = String(r[nameCol]||"").trim();
                                  if (!name) return;
                                  newData[name.toLowerCase()] = { name, replied: parseNum(r[repliedCol]) };
                                });
                                setAgentPerf(prev => ({...prev, [perfMk]: {...(prev[perfMk]||{}), ...newData}}));
                                alert(`Agent performance imported!\n• ${Object.keys(newData).length} agents updated for ${MONTHS[volMonth-1]} ${volYear}`);
                              }}/>
                            <button style={{padding:"6px 14px",borderRadius:7,border:"1px solid #0D9488",background:"transparent",color:"#0D9488",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                              Import Agent Data
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {t1Agents.length === 0 ? (
                      <div style={{padding:24,textAlign:"center",color:"#94A3B8",fontSize:12}}>No T1 agents found.</div>
                    ) : (
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                        <thead><tr style={{background:"#F8FAFC"}}>
                          <th style={{padding:"8px 14px",textAlign:"left",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:180}}>Agent</th>
                          <th style={{padding:"8px 14px",textAlign:"left",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:80}}>PCode</th>
                          <th style={{padding:"8px 14px",textAlign:"right",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#0D9488",minWidth:140}}>Replied Chats</th>
                          <th style={{padding:"8px 14px",textAlign:"right",borderBottom:"1px solid #F1F5F9",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",minWidth:100}}>% of Total</th>
                        </tr></thead>
                        <tbody>
                          {[...t1Agents].sort((a,b)=>(a.id||"").localeCompare(b.id||"",undefined,{numeric:true})).map((a,i) => {
                            const v = monthAgentData[a.name.toLowerCase()]?.replied || 0;
                            const pct = allChats > 0 ? (v/allChats*100) : 0;
                            return (
                              <tr key={a.id} style={{borderBottom:"1px solid #F1F5F9",background:i%2===0?"#FAFBFC":"transparent"}}>
                                <td style={{padding:"8px 14px",fontWeight:600,color:"#1A1D2E"}}>{a.name}</td>
                                <td style={{padding:"8px 14px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:ALLOC_TEAM_C[a.team]?.bg,color:ALLOC_TEAM_C[a.team]?.color,fontWeight:700,fontFamily:"monospace"}}>{a.id}</span></td>
                                <td style={{padding:"8px 14px",textAlign:"right",fontFamily:"monospace",fontWeight:700,color:v>0?"#0D9488":"#CBD5E1"}}>{v ? v.toLocaleString() : "—"}</td>
                                <td style={{padding:"8px 14px",textAlign:"right",fontFamily:"monospace",color:"#64748B"}}>{pct>0?`${pct.toFixed(1)}%`:"—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <div style={{padding:"10px 16px",fontSize:10,color:"#94A3B8",borderTop:"1px solid #F1F5F9"}}>
                      Import a Duoke per-agent export (CSV or XLSX). Required columns: Agent/Name, Replied Chats. Values are stored per month — navigate months to see history.
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════
            CS ANALYTICS TAB — Customer Service Dashboard
        ══════════════════════════════════════════ */}
        {allocTab==="analytics" && (
          <div style={{margin:"-24px -28px"}}>
            <CSAnalyticsTab role={role} canEdit={role==="manager"} monthlyCost={totalCost} currentMonthCode={["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][volMonth-1]} chatByBrand={(() => {
              // Aggregate Chat Volume data (per brand × platform × month) for CS Analytics
              const out = {};
              Object.entries(monthlyVol || {}).forEach(([mk, brandsObj]) => {
                const m = String(mk).match(/-(\d{2})/);
                if (!m) return;
                const code = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][parseInt(m[1],10)-1];
                if (!code) return;
                if (!out[code]) out[code] = [];
                Object.entries(brandsObj || {}).forEach(([bid, platVol]) => {
                  const b = brands.find(br => br.id === bid);
                  if (!b) return;
                  Object.entries(platVol || {}).forEach(([p, c]) => {
                    if ((c || 0) > 0) out[code].push({ brand: b.name, platform: p, chats: c, rt: 0 });
                  });
                });
              });
              return out;
            })()} chatsByMonth={(() => {
              // Aggregate NiRM Performance Replied Chats by month-of-year code (jan/feb/.../dec).
              const out = {};
              Object.entries(agentPerf || {}).forEach(([mk, byAgent]) => {
                const m = String(mk).match(/-(\d{2})/);
                if (!m) return;
                const code = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][parseInt(m[1],10)-1];
                if (!code) return;
                const total = Object.values(byAgent || {}).reduce((s,a) => s + (a?.replied || 0), 0);
                out[code] = (out[code] || 0) + total;
              });
              return out;
            })()}/>
          </div>
        )}

        </div>
      </div>

      {/* ═══ PROFILE MODAL ═══ */}
      {showProfile && (() => {
        const uKey = (loginUser||"").toLowerCase();
        const p = userProfiles[uKey] || {};
        const fields = [
          {key:"fullName",label:"Full Name",placeholder:"e.g. Somchai Jaidee"},
          {key:"preferName",label:"Preferred Name",placeholder:"e.g. Ohm"},
          {key:"lineId",label:"Line ID",placeholder:"e.g. @ohm_work"},
          {key:"emergencyContact",label:"Emergency Contact",placeholder:"e.g. Mom 081-234-5678"},
          {key:"personalEmail",label:"Personal Email",placeholder:"e.g. ohm@gmail.com"},
          {key:"workEmail",label:"Work Email",placeholder:"e.g. ohm@company.com"},
        ];
        // Find the agent linked to this login so we can show Agent ID + profile photo
        const linkedAgent = agents.find(a => (a.email && a.email.toLowerCase().trim() === uKey) || (a.name && a.name.toLowerCase().trim() === uKey));
        const updateField = (key, val) => {
          setUserProfiles(prev => ({...prev, [uKey]: {...(prev[uKey]||{}), [key]: val}}));
        };
        return (
          <div onClick={()=>setShowProfile(false)} style={{position:"fixed",inset:0,zIndex:9999,background:"#00000044",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:480,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px #00000022"}}>
              <div style={{padding:"24px 24px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  {linkedAgent && linkedAgent.profilePhotoUrl
                    ? <img src={linkedAgent.profilePhotoUrl} alt="" style={{width:44,height:44,borderRadius:11,objectFit:"cover"}}/>
                    : <div style={{width:44,height:44,borderRadius:11,background:"#F0FDFA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#0D9488"}}>{(loginUser||"U").charAt(0).toUpperCase()}</div>}
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>My Profile</div>
                    <div style={{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span>{loginUser}</span>
                      <span>·</span>
                      <span>{ROLES[role]?.label}</span>
                      {linkedAgent && <><span>·</span><span style={{padding:"1px 6px",borderRadius:4,background:"#F0FDFA",color:"#0D9488",fontFamily:"monospace",fontWeight:700}}>{linkedAgent.id}</span></>}
                    </div>
                  </div>
                </div>
                <button onClick={()=>setShowProfile(false)} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"transparent",cursor:"pointer",fontSize:16,color:"#94A3B8",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              </div>
              <div style={{padding:"20px 24px 24px"}}>
                {fields.map(f => (
                  <div key={f.key} style={{marginBottom:14}}>
                    <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:5}}>{f.label}</label>
                    <input value={p[f.key]||""} onChange={e=>updateField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"#FAFBFC",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border 0.15s"}}
                      onFocus={e=>e.target.style.borderColor="#0D9488"}
                      onBlur={e=>e.target.style.borderColor="#E2E8F0"}
                    />
                  </div>
                ))}
                <button onClick={()=>setShowProfile(false)} style={{width:"100%",padding:"11px",borderRadius:9,border:"none",background:"#0D9488",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>Save & Close</button>
                <div style={{fontSize:10,color:"#CBD5E1",textAlign:"center",marginTop:10}}>Profile saves automatically</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          USER MANAGEMENT MODAL (Manager only)
      ══════════════════════════════════════════ */}
      {showUserMgmt && role==="manager" && (
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onMouseDown={(e)=>{ if (e.target === e.currentTarget) { setShowUserMgmt(false); setEditingUser(null); } }}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:620,maxWidth:"95vw",maxHeight:"90vh",overflow:"auto",boxShadow:"0 16px 48px #00000088"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:700,color:"#1A1D2E"}}>User Accounts</div>
              <button onClick={()=>{setShowUserMgmt(false);setEditingUser(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",fontSize:20}}>×</button>
            </div>
            <div style={{borderRadius:10,border:"1px solid #E2E8F0",overflow:"hidden",marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead><tr style={{background:"#F1F5F9"}}>
                  <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>Email</th>
                  <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>Agent</th>
                  <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>Role</th>
                  <th style={{padding:"8px 12px",textAlign:"center",fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>Actions</th>
                </tr></thead>
                <tbody>
                  {userAccounts.map((u,i) => (
                    <tr key={i} style={{borderTop:"1px solid #F1F5F9"}}>
                      <td style={{padding:"8px 12px",fontWeight:600,color:"#1A1D2E"}}>{u.username}</td>
                      <td style={{padding:"8px 12px",whiteSpace:"nowrap"}}>{(()=>{const ag=agents.find(a=>(a.email||"").toLowerCase()===u.username.toLowerCase());return ag?(<><span style={{fontSize:10,padding:"2px 6px",borderRadius:6,background:"#F0FDFA",color:"#0D9488",fontWeight:700,fontFamily:"monospace",marginRight:6}}>{ag.id}</span><span style={{fontWeight:600,color:"#1A1D2E"}}>{ag.name}</span></>):(<span style={{color:"#CBD5E1"}}>-</span>);})()}</td>
                      <td style={{padding:"8px 12px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:ROLES[u.role]?.bg||"#F1F5F9",color:ROLES[u.role]?.color||"#64748B",fontWeight:700}}>{ROLES[u.role]?.label||u.role}</span></td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        <button onClick={()=>setEditingUser({...u,_idx:i,_isNew:false})} style={{padding:"3px 10px",borderRadius:6,border:"none",background:"#EFF6FF",color:"#1D4ED8",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginRight:4}}>Edit</button>
                        {u.username.toLowerCase()!==loginUser.toLowerCase() && <button onClick={()=>{if(window.confirm("Delete user '"+u.username+"'?"))setUserAccounts(prev=>prev.filter((_,j)=>j!==i));}} style={{padding:"3px 10px",borderRadius:6,border:"none",background:"#FEF2F2",color:"#EF4444",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditingUser({username:"",password:"",role:"viewer",_isNew:true,_invite:true})} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Invite User</button>
              <button onClick={()=>setEditingUser({username:"",password:"",role:"viewer",_isNew:true,_invite:false})} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #0D9488",background:"transparent",color:"#0D9488",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add with password</button>
            </div>
            {editingUser && (
              <div style={{marginTop:16,padding:16,borderRadius:10,border:"1px solid #E2E8F0",background:"#FAFBFC"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#1A1D2E",marginBottom:12}}>{editingUser._isNew?(editingUser._invite?"Invite New User":"Add New User (with password)"):"Edit User"}</div>
                {editingUser._isNew && editingUser._invite && (
                  <div style={{fontSize:11,color:"#64748B",marginBottom:12,padding:"8px 10px",background:"#EFF6FF",borderRadius:6,lineHeight:1.5}}>
                    They will receive an email with a link to set their own password. Make sure their email domain is verified in Resend, or the email won't be delivered.
                  </div>
                )}
                <div style={{display:editingUser._isNew && editingUser._invite ? "block" : "grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                  <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Email (used to sign in)</label>
                    <input value={editingUser.username} type="email" placeholder="someone@crea.asia" onChange={e=>setEditingUser({...editingUser,username:e.target.value})} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                  {!(editingUser._isNew && editingUser._invite) && (
                    <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Password</label>
                      <input value={editingUser.password} onChange={e=>setEditingUser({...editingUser,password:e.target.value})} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                  )}
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Role</label>
                  <div style={{display:"flex",gap:6}}>
                    {Object.entries(ROLES).map(([key,r])=>(
                      <button key={key} onClick={()=>setEditingUser({...editingUser,role:key})} style={{padding:"6px 14px",borderRadius:8,border:"none",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",background:editingUser.role===key?r.bg:"#F1F5F9",color:editingUser.role===key?r.color:"#94A3B8",outline:editingUser.role===key?`2px solid ${r.color}`:"none"}}>{r.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={async ()=>{
                    const email = editingUser.username.trim();
                    const pw = editingUser.password;
                    const isInvite = editingUser._isNew && editingUser._invite;
                    if(!email){alert("Email required.");return;}
                    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){alert("Please enter a valid email address.");return;}
                    if(!isInvite && !pw){alert("Password required (or use Invite to send an email).");return;}
                    if(!isInvite && pw.length < 6){alert("Password must be at least 6 characters.");return;}
                    if(editingUser._isNew){
                      if(userAccounts.some(u=>u.username.toLowerCase()===email.toLowerCase())){alert("This email is already in the user list.");return;}
                      // Save current Supabase session so signUp() doesn't replace it
                      const { data: { session: currentSession } } = await supabase.auth.getSession();
                      // FIX (round-9 senior review HIGH/B): the Add User identity swap.
                      // supabase.auth.signUp() auto-signs-in the new user, which
                      // fires SIGNED_IN in App.jsx. If the new user's email already
                      // has a profile row (re-invite, pre-existing account), the
                      // listener's getCurrentRole() can resolve a non-null profile
                      // for them and call setProfile(newUser) — silently swapping
                      // the admin's identity in React state.
                      // Mitigation: while this block runs, expose a global guard
                      // that App.jsx checks. If a SIGNED_IN event arrives for any
                      // user ID other than the admin, the listener returns without
                      // touching profile state. The guard is set BEFORE signUp and
                      // cleared in a finally block to guarantee cleanup even on
                      // throw.
                      window.__nirmInviteInProgress = true;
                      window.__nirmAdminUserId = currentSession?.user?.id || null;
                      // For invite mode, generate a random temp password — the user will reset it via email
                      const finalPw = isInvite
                        ? `Inv${Math.random().toString(36).slice(2,10)}${Math.random().toString(36).slice(2,10).toUpperCase()}!`
                        : pw;
                      let signUpData, signUpError;
                      try {
                        ({ data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password: finalPw }));
                        // Restore the current admin's session (signUp swaps to the new user)
                        if(currentSession) {
                          await supabase.auth.setSession({ access_token: currentSession.access_token, refresh_token: currentSession.refresh_token });
                        }
                      } finally {
                        // Give any in-flight SIGNED_IN listeners a moment to run
                        // through their async getCurrentRole() with the guard
                        // still set, THEN clear it. 300ms is comfortably longer
                        // than a profile fetch.
                        setTimeout(() => {
                          window.__nirmInviteInProgress = false;
                          window.__nirmAdminUserId = null;
                        }, 300);
                      }
                      const isAlreadyRegistered = signUpError && /already.*registered|already.*exists|user.*exists/i.test(signUpError.message);
                      if(signUpError && !isAlreadyRegistered){
                        alert("Could not create Supabase user: "+signUpError.message+"\n\nThe user was NOT added.");
                        return;
                      }
                      // FIX (round-7 review MEDIUM): the "already registered" branch.
                      // signUp returns no user-id when the email already has an Auth
                      // account, so we can't auto-create a profiles row. Surface a
                      // clear alert instructing the manager to handle this case
                      // explicitly rather than silently leaving the user half-
                      // configured (in userAccounts but with no profile row → stuck
                      // on login screen because getCurrentRole returns null).
                      if (isAlreadyRegistered) {
                        alert(
                          "This email already has a Supabase Auth account.\n\n" +
                          "If they can sign in already, no action needed — they'll use their existing password.\n\n" +
                          "If their profile row is missing (they get stuck on the login screen after signing in), have them use 'Forgot Password' to reset, OR remove them from this User Accounts list and have a developer manually create the profiles row via SQL."
                        );
                        // Still add to userAccounts so the role mapping is recorded
                        // — even without a profile row, the app's local logic uses
                        // this list as a fallback.
                      }
                      // FIX: also create a profiles row. Without it, getCurrentRole()
                      // returns null on sign-in and the user gets stuck on the login
                      // screen even with a valid Auth account.
                      // NOTE (round-7 review): this upsert requires an RLS policy on
                      // `profiles` allowing the manager to INSERT/UPDATE rows for
                      // *other* users (not just their own). Default Supabase RLS
                      // only lets users edit their own profile. If you see
                      // "row-level security policy" errors here, add a policy like:
                      //   CREATE POLICY "manager can write any profile"
                      //     ON public.profiles FOR ALL TO authenticated
                      //     USING (EXISTS (SELECT 1 FROM profiles
                      //                    WHERE id = auth.uid() AND role = 'manager'))
                      //     WITH CHECK (EXISTS (SELECT 1 FROM profiles
                      //                         WHERE id = auth.uid() AND role = 'manager'));
                      const newUserId = signUpData?.user?.id;
                      if (newUserId) {
                        const { error: profErr } = await supabase
                          .from("profiles")
                          .upsert({
                            id: newUserId,
                            username: email,
                            role: editingUser.role,
                            display_name: email.split("@")[0],
                          }, { onConflict: "id" });
                        if (profErr) {
                          console.error("Failed to create profile row:", profErr);
                          alert("Auth account created, but profile row could not be saved: " + profErr.message + "\n\nThe user may need their role set manually before signing in.\n\n(This usually means the 'profiles' table RLS policy doesn't allow the manager to write rows for other users. See the source comment for the SQL fix.)");
                        }
                      }
                      if(isInvite){
                        // Send the password recovery email so they can set their own password
                        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
                        if(resetErr){
                          alert("Account created, but the invitation email could not be sent: "+resetErr.message+"\n\nThey can use Forgot Password on the sign-in page later.");
                        } else {
                          alert("Invitation sent to "+email+".\n\nThey will receive an email with a link to set their password. Note: Resend sandbox only delivers to verified emails until your domain is verified.");
                        }
                        // Use the "__supabase__" sentinel so the legacy login auto-bypass kicks in
                        setUserAccounts(prev=>[...prev,{username:email,password:"__supabase__",role:editingUser.role}]);
                      } else {
                        setUserAccounts(prev=>[...prev,{username:email,password:pw,role:editingUser.role}]);
                        alert("User created. They can sign in at the app URL with this email and password.");
                      }
                    } else {
                      const isOwn = userAccounts[editingUser._idx]?.username.toLowerCase()===loginUser.toLowerCase();
                      const oldPw = userAccounts[editingUser._idx]?.password;
                      if(isOwn && pw && pw !== oldPw && pw !== "__supabase__"){
                        const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
                        if(pwErr){
                          alert("Saved locally, but Supabase password update failed: "+pwErr.message+"\nYou may need to sign out and use Forgot Password.");
                        }
                      } else if(!isOwn && pw && pw !== oldPw && pw !== "__supabase__"){
                        alert("Password changed in the user list, but the user's actual sign-in password is NOT updated. They will keep using their old password.\n\nTo reset another user's password: have them use Forgot Password on the sign-in page, or have them sign in and change it from their own account.");
                      }
                      // Sync role to Supabase profiles - the single source of truth the
                      // login path reads. Without this, the role reverts on next login.
                      try {
                        let { data: prow } = await supabase.from("profiles").select("id,role").eq("username", email).maybeSingle();
                        if (!prow) {
                          const { data: cand } = await supabase.from("profiles").select("id,role,username").ilike("username", email.split("@")[0] + "%");
                          if (cand && cand.length === 1) prow = cand[0];
                        }
                        if (prow && prow.role !== editingUser.role) {
                          await supabase.from("profiles").update({ role: editingUser.role }).eq("id", prow.id);
                        } else if (!prow) {
                          alert("Note: no matching Supabase profile found for " + email + " - role saved in app only and may revert on next login.");
                        }
                      } catch (_) { /* non-fatal */ }
                      setUserAccounts(prev=>prev.map((u,i)=>i===editingUser._idx?{username:email,password:pw,role:editingUser.role}:u));
                      if(isOwn) setRole(editingUser.role);
                    }
                    setEditingUser(null);
                  }} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{editingUser._isNew?"Add":"Save"}</button>
                  <button onClick={()=>setEditingUser(null)} style={{padding:"8px 20px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",color:"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Change own password (non-manager) */}
      {showUserMgmt && role && role!=="manager" && (
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onClick={()=>setShowUserMgmt(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:400,maxWidth:"95vw",boxShadow:"0 16px 48px #00000088"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,color:"#1A1D2E",marginBottom:20}}>My Account</div>
            {(()=>{const myAccount=userAccounts.find(u=>u.username.toLowerCase()===loginUser.toLowerCase());if(!myAccount)return <div style={{color:"#94A3B8"}}>Account not found</div>;const myIdx=userAccounts.indexOf(myAccount);return(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Username</label>
                  <input defaultValue={myAccount.username} id="__myUser" style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Password</label>
                  <input defaultValue={myAccount.password} id="__myPass" style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"#fff",color:"#1A1D2E",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/></div>
                <div><label style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",display:"block",marginBottom:4}}>Role</label>
                  <div style={{padding:"8px 10px",borderRadius:8,background:ROLES[myAccount.role]?.bg,color:ROLES[myAccount.role]?.color,fontSize:12,fontWeight:700}}>{ROLES[myAccount.role]?.label} <span style={{fontSize:10,fontWeight:400,opacity:0.7}}>— only Manager can change</span></div></div>
                <button onClick={()=>{const u=document.getElementById("__myUser")?.value?.trim();const p=document.getElementById("__myPass")?.value;if(!u||!p){alert("Required");return;}setUserAccounts(prev=>prev.map((a,i)=>i===myIdx?{...a,username:u,password:p}:a));setLoginUser(u);setShowUserMgmt(false);}} style={{padding:"10px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
              </div>);})()}
          </div>
        </div>
      )}

      {/* ── eSign Signature Pad Modal (component-level, always rendered) ── */}
      {/* ── eSign Signature Pad Modal ── */}
      {signPadOpen && (
        <div style={{position:"fixed",inset:0,zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)"}}
          onMouseDown={(e)=>{ if(e.target===e.currentTarget) setSignPadOpen(false); }}>
          <div style={{background:"#fff",borderRadius:16,padding:24,width:520,maxWidth:"95vw",boxShadow:"0 24px 64px #00000099"}}>
            <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:700,color:"#1A1D2E"}}>เซ็นชื่อ / Sign Invoice</div>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>เซ็นด้วยเมาส์หรือนิ้ว / Draw with mouse or finger</div>
            </div>
            <canvas ref={signCanvasRef} width="480" height="200"
        style={{width:"100%",maxWidth:480,height:200,border:"2px dashed #0D9488",borderRadius:10,background:"#fff",touchAction:"none",cursor:"crosshair",display:"block",margin:"0 auto"}}
        onPointerDown={(e)=>{
          const c = signCanvasRef.current; if(!c) return;
          c.setPointerCapture(e.pointerId);
          const rect = c.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (c.width / rect.width);
          const y = (e.clientY - rect.top) * (c.height / rect.height);
          signDrawingRef.current = { drawing: true, last: { x, y } };
        }}
        onPointerMove={(e)=>{
          if (!signDrawingRef.current.drawing) return;
          const c = signCanvasRef.current; if(!c) return;
          const rect = c.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (c.width / rect.width);
          const y = (e.clientY - rect.top) * (c.height / rect.height);
          const ctx = c.getContext("2d");
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#0F172A";
          ctx.beginPath();
          ctx.moveTo(signDrawingRef.current.last.x, signDrawingRef.current.last.y);
          ctx.lineTo(x, y);
          ctx.stroke();
          signDrawingRef.current.last = { x, y };
        }}
        onPointerUp={()=>{ signDrawingRef.current = { drawing: false, last: null }; }}
        onPointerCancel={()=>{ signDrawingRef.current = { drawing: false, last: null }; }}
            />
            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:16}}>
        <button onClick={clearSignaturePad}
          style={{padding:"9px 16px",borderRadius:8,border:"1px solid #E2E8F0",background:"transparent",color:"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          ล้าง / Clear
        </button>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setSignPadOpen(false)}
            style={{padding:"9px 18px",borderRadius:8,border:"1px solid #E2E8F0",background:"transparent",color:"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            ยกเลิก / Cancel
          </button>
          <button onClick={saveSignaturePad}
            style={{padding:"9px 22px",borderRadius:8,border:"none",background:"#0D9488",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            บันทึก / Save
          </button>
            </div>
          </div>
        </div>
      </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
        button { transition: all 0.15s ease; }
        button:hover { opacity: 0.85; }
        input::placeholder, textarea::placeholder { color: #94A3B8; }
        select option { background: #FFFFFF; color: #1A1D2E; }
        input:focus, select:focus { border-color: #0D9488 !important; outline: none; }

        @media (max-width: 900px) {
          nav, [role="tablist"] {
            overflow-x: auto !important;
            white-space: nowrap !important;
            -webkit-overflow-scrolling: touch;
          }
          table { display: block; max-width: 100vw; overflow-x: auto !important; }
          th[style*="sticky"], td[style*="sticky"] {
            min-width: 60px !important; max-width: 110px !important;
          }
          h1 { font-size: 18px !important; }
          h2 { font-size: 15px !important; }
          h3 { font-size: 13px !important; }
        }
        @media (max-width: 480px) {
          body, #root { font-size: 12px !important; }
        }
        @media (hover: none) {
          button:hover { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
