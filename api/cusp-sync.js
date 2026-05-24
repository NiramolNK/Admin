// ════════════════════════════════════════════════════════════════════════════
// Vercel Serverless Function — /api/cusp-sync
//
// Returns a CUSP order-data snapshot in CS Analytics brand shape.
//
// The snapshot was generated from CUSP Redshift (crea_reporting.t_crea_all_perf_w_target)
// via the MCP query_redshift tool. It covers Jan-May 2026 per-brand orders summed
// across Shopee / Lazada / TikTok for TH shops with service_model IN (Retail, Service).
//
// To refresh:
//   1. Run the CUSP queries in Cowork (see tools/cusp-snapshot-builder.md).
//   2. Replace the SNAPSHOT object below with the new JSON.
//   3. git push — Vercel rebuilds.
//
// Long-term, this could be swapped for a live Redshift connection — see
// the README comment at the bottom for the env vars / library that would
// be needed.
// ════════════════════════════════════════════════════════════════════════════

const SNAPSHOT = {
  "source": "cusp",
  "period": "Jan-May 2026",
  "months": [
    "jan",
    "feb",
    "mar",
    "apr",
    "may"
  ],
  "monthLabels": {
    "jan": "January",
    "feb": "February",
    "mar": "March",
    "apr": "April",
    "may": "May"
  },
  "brands": [
    {
      "name": "111SKIN-IN",
      "group": "Other",
      "q2": 2033,
      "janO": 505,
      "febO": 453,
      "marO": 427,
      "aprO": 295,
      "mayO": 353
    },
    {
      "name": "Acne Aid and Spectraban-IN",
      "group": "Other",
      "q2": 126132,
      "janO": 23767,
      "febO": 22549,
      "marO": 28253,
      "aprO": 29117,
      "mayO": 22446
    },
    {
      "name": "Aestura - Amore",
      "group": "Amore",
      "q2": 2145,
      "janO": 27,
      "febO": 0,
      "marO": 0,
      "aprO": 0,
      "mayO": 2118
    },
    {
      "name": "Armani Exchange-CMG",
      "group": "CMG",
      "q2": 1534,
      "janO": 470,
      "febO": 325,
      "marO": 401,
      "aprO": 192,
      "mayO": 146
    },
    {
      "name": "Banila-CMG",
      "group": "CMG",
      "q2": 16870,
      "janO": 3150,
      "febO": 3274,
      "marO": 4357,
      "aprO": 3249,
      "mayO": 2840
    },
    {
      "name": "Casio-CMG",
      "group": "CMG",
      "q2": 56941,
      "janO": 11945,
      "febO": 13178,
      "marO": 11475,
      "aprO": 10230,
      "mayO": 10113
    },
    {
      "name": "Chang Choice - IN notax",
      "group": "Other",
      "q2": 40,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 0,
      "mayO": 40
    },
    {
      "name": "Clarins-CMG",
      "group": "CMG",
      "q2": 7657,
      "janO": 937,
      "febO": 1138,
      "marO": 2369,
      "aprO": 1488,
      "mayO": 1725
    },
    {
      "name": "Crocs-CMG",
      "group": "CMG",
      "q2": 160909,
      "janO": 32137,
      "febO": 30428,
      "marO": 32802,
      "aprO": 38862,
      "mayO": 26680
    },
    {
      "name": "Decathlon Thailand",
      "group": "Other",
      "q2": 129101,
      "janO": 19681,
      "febO": 17633,
      "marO": 30880,
      "aprO": 31251,
      "mayO": 29656
    },
    {
      "name": "Dettol-IN",
      "group": "Reckitt",
      "q2": 100801,
      "janO": 11492,
      "febO": 15271,
      "marO": 28744,
      "aprO": 25452,
      "mayO": 19842
    },
    {
      "name": "Durex-IN",
      "group": "Reckitt",
      "q2": 15517,
      "janO": 2307,
      "febO": 2382,
      "marO": 3829,
      "aprO": 3803,
      "mayO": 3196
    },
    {
      "name": "FILA-CMG",
      "group": "CMG",
      "q2": 989,
      "janO": 989,
      "febO": 0,
      "marO": 0,
      "aprO": 0,
      "mayO": 0
    },
    {
      "name": "FitFlop - CMG",
      "group": "CMG",
      "q2": 56265,
      "janO": 12394,
      "febO": 12435,
      "marO": 12734,
      "aprO": 9986,
      "mayO": 8716
    },
    {
      "name": "G2000 - CMG",
      "group": "CMG",
      "q2": 20983,
      "janO": 4184,
      "febO": 4628,
      "marO": 4497,
      "aprO": 4329,
      "mayO": 3345
    },
    {
      "name": "Guess-CMG TH",
      "group": "CMG",
      "q2": 32102,
      "janO": 5097,
      "febO": 6348,
      "marO": 6537,
      "aprO": 8283,
      "mayO": 5837
    },
    {
      "name": "HERA - Amore",
      "group": "Amore",
      "q2": 491,
      "janO": 13,
      "febO": 0,
      "marO": 0,
      "aprO": 0,
      "mayO": 478
    },
    {
      "name": "Hey Dude-CMG",
      "group": "CMG",
      "q2": 1503,
      "janO": 543,
      "febO": 514,
      "marO": 446,
      "aprO": 0,
      "mayO": 0
    },
    {
      "name": "Hill's-IN",
      "group": "Other",
      "q2": 25893,
      "janO": 4862,
      "febO": 4941,
      "marO": 6612,
      "aprO": 5296,
      "mayO": 4182
    },
    {
      "name": "Hush Puppies - CMG",
      "group": "CMG",
      "q2": 18569,
      "janO": 3416,
      "febO": 3693,
      "marO": 4470,
      "aprO": 3662,
      "mayO": 3328
    },
    {
      "name": "JDE-IN",
      "group": "Other",
      "q2": 153601,
      "janO": 24412,
      "febO": 30425,
      "marO": 40512,
      "aprO": 32949,
      "mayO": 25303
    },
    {
      "name": "JUNGSAEMMOOL-CMG",
      "group": "CMG",
      "q2": 50102,
      "janO": 9644,
      "febO": 10406,
      "marO": 13072,
      "aprO": 9142,
      "mayO": 7838
    },
    {
      "name": "Jockey - CMG",
      "group": "CMG",
      "q2": 14841,
      "janO": 2699,
      "febO": 2809,
      "marO": 3947,
      "aprO": 3245,
      "mayO": 2141
    },
    {
      "name": "KIKO - CMG",
      "group": "CMG",
      "q2": 24345,
      "janO": 5121,
      "febO": 4583,
      "marO": 5753,
      "aprO": 4910,
      "mayO": 3978
    },
    {
      "name": "LEE - CMG",
      "group": "CMG",
      "q2": 30200,
      "janO": 5983,
      "febO": 7624,
      "marO": 6588,
      "aprO": 5584,
      "mayO": 4421
    },
    {
      "name": "Laneige - Amore",
      "group": "Amore",
      "q2": 23423,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 9154,
      "mayO": 14269
    },
    {
      "name": "MEGA We Care-IN",
      "group": "Other",
      "q2": 22682,
      "janO": 0,
      "febO": 0,
      "marO": 5239,
      "aprO": 9309,
      "mayO": 8134
    },
    {
      "name": "MLB - CMG",
      "group": "CMG",
      "q2": 19512,
      "janO": 3099,
      "febO": 3753,
      "marO": 4613,
      "aprO": 4705,
      "mayO": 3342
    },
    {
      "name": "Milo - Nestle",
      "group": "Nestle",
      "q2": 1,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 0,
      "mayO": 1
    },
    {
      "name": "Mondelez-IN",
      "group": "Other",
      "q2": 63269,
      "janO": 14937,
      "febO": 9103,
      "marO": 15634,
      "aprO": 13148,
      "mayO": 10447
    },
    {
      "name": "Mustela",
      "group": "Other",
      "q2": 5941,
      "janO": 372,
      "febO": 1224,
      "marO": 1517,
      "aprO": 1614,
      "mayO": 1214
    },
    {
      "name": "Nescafe",
      "group": "Nestle",
      "q2": 3865,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 1306,
      "mayO": 2559
    },
    {
      "name": "Nescafe Dolce Gusto-IN",
      "group": "Nestle",
      "q2": 84219,
      "janO": 18521,
      "febO": 15789,
      "marO": 20094,
      "aprO": 16446,
      "mayO": 13369
    },
    {
      "name": "Nespresso",
      "group": "Nestle",
      "q2": 1339,
      "janO": 186,
      "febO": 160,
      "marO": 288,
      "aprO": 352,
      "mayO": 353
    },
    {
      "name": "Nestle Food & Beverages Official",
      "group": "Nestle",
      "q2": 126675,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 56704,
      "mayO": 69971
    },
    {
      "name": "Nestle Health Science - IN",
      "group": "Nestle",
      "q2": 13072,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 5241,
      "mayO": 7831
    },
    {
      "name": "Nestle PetCare-IN",
      "group": "Nestle",
      "q2": 164332,
      "janO": 28497,
      "febO": 29617,
      "marO": 39889,
      "aprO": 37329,
      "mayO": 29000
    },
    {
      "name": "Paul Smith-CMG",
      "group": "CMG",
      "q2": 2478,
      "janO": 636,
      "febO": 471,
      "marO": 510,
      "aprO": 457,
      "mayO": 404
    },
    {
      "name": "Pedigree & Whiskas-IN",
      "group": "Mars",
      "q2": 381066,
      "janO": 79735,
      "febO": 74217,
      "marO": 85808,
      "aprO": 78843,
      "mayO": 62463
    },
    {
      "name": "Polo Ralph Lauren-CMG",
      "group": "CMG",
      "q2": 11994,
      "janO": 2929,
      "febO": 2443,
      "marO": 2162,
      "aprO": 2380,
      "mayO": 2080
    },
    {
      "name": "Revlon-IN",
      "group": "Other",
      "q2": 71492,
      "janO": 17143,
      "febO": 12192,
      "marO": 15893,
      "aprO": 14549,
      "mayO": 11715
    },
    {
      "name": "Rinbee",
      "group": "Other",
      "q2": 690,
      "janO": 20,
      "febO": 566,
      "marO": 56,
      "aprO": 44,
      "mayO": 4
    },
    {
      "name": "STIEBEL ELTRON TH",
      "group": "Other",
      "q2": 243,
      "janO": 0,
      "febO": 14,
      "marO": 91,
      "aprO": 67,
      "mayO": 71
    },
    {
      "name": "Shark Ninja",
      "group": "Other",
      "q2": 2250,
      "janO": 0,
      "febO": 0,
      "marO": 0,
      "aprO": 0,
      "mayO": 2250
    },
    {
      "name": "Smart-Travel",
      "group": "Other",
      "q2": 967,
      "janO": 327,
      "febO": 307,
      "marO": 333,
      "aprO": 0,
      "mayO": 0
    },
    {
      "name": "Sulwhasoo - Amore",
      "group": "Amore",
      "q2": 8262,
      "janO": 0,
      "febO": 0,
      "marO": 2451,
      "aprO": 2949,
      "mayO": 2862
    },
    {
      "name": "THREE - CMG",
      "group": "CMG",
      "q2": 9678,
      "janO": 1711,
      "febO": 1732,
      "marO": 2874,
      "aprO": 1777,
      "mayO": 1584
    },
    {
      "name": "The North Face - TOG",
      "group": "Other",
      "q2": 9112,
      "janO": 2692,
      "febO": 2853,
      "marO": 3567,
      "aprO": 0,
      "mayO": 0
    },
    {
      "name": "Tinder-IN",
      "group": "Other",
      "q2": 31641,
      "janO": 6488,
      "febO": 5875,
      "marO": 7164,
      "aprO": 7278,
      "mayO": 4836
    },
    {
      "name": "Tommy Hilfiger-MY PVH",
      "group": "CMG",
      "q2": 8531,
      "janO": 1559,
      "febO": 1639,
      "marO": 2217,
      "aprO": 1755,
      "mayO": 1361
    },
    {
      "name": "ULTIMA II-IN",
      "group": "Other",
      "q2": 754,
      "janO": 137,
      "febO": 155,
      "marO": 145,
      "aprO": 178,
      "mayO": 139
    },
    {
      "name": "Wrangler - CMG",
      "group": "CMG",
      "q2": 25856,
      "janO": 4462,
      "febO": 6936,
      "marO": 6829,
      "aprO": 3952,
      "mayO": 3677
    },
    {
      "name": "[Nestle Professional] Shop at Nestle",
      "group": "Nestle",
      "q2": 29828,
      "janO": 5751,
      "febO": 5494,
      "marO": 7607,
      "aprO": 8503,
      "mayO": 2473
    }
  ],
  "platformTotalsByBrand": {
    "111SKIN-IN": {
      "jan": {
        "lazada": 56,
        "shopee": 449
      },
      "feb": {
        "lazada": 64,
        "shopee": 389
      },
      "mar": {
        "lazada": 91,
        "shopee": 336
      },
      "apr": {
        "lazada": 38,
        "shopee": 257
      },
      "may": {
        "lazada": 76,
        "shopee": 277
      }
    },
    "Acne Aid and Spectraban-IN": {
      "jan": {
        "lazada": 1425,
        "shopee": 16015,
        "tiktok": 6327
      },
      "feb": {
        "lazada": 1018,
        "shopee": 15712,
        "tiktok": 5819
      },
      "mar": {
        "lazada": 2491,
        "shopee": 18633,
        "tiktok": 7129
      },
      "apr": {
        "lazada": 966,
        "shopee": 20691,
        "tiktok": 7460
      },
      "may": {
        "lazada": 865,
        "shopee": 15766,
        "tiktok": 5815
      }
    },
    "Aestura - Amore": {
      "jan": {
        "lazada": 1,
        "shopee": 26
      },
      "may": {
        "lazada": 121,
        "shopee": 1997
      }
    },
    "Armani Exchange-CMG": {
      "jan": {
        "lazada": 157,
        "shopee": 313
      },
      "feb": {
        "lazada": 100,
        "shopee": 225
      },
      "mar": {
        "lazada": 166,
        "shopee": 235
      },
      "apr": {
        "lazada": 56,
        "shopee": 136
      },
      "may": {
        "lazada": 52,
        "shopee": 94
      }
    },
    "Banila-CMG": {
      "jan": {
        "lazada": 371,
        "shopee": 2779
      },
      "feb": {
        "lazada": 498,
        "shopee": 2776
      },
      "mar": {
        "lazada": 1032,
        "shopee": 3325
      },
      "apr": {
        "lazada": 435,
        "shopee": 2814
      },
      "may": {
        "lazada": 351,
        "shopee": 2489
      }
    },
    "Casio-CMG": {
      "jan": {
        "lazada": 983,
        "shopee": 10962
      },
      "feb": {
        "lazada": 945,
        "shopee": 12233
      },
      "mar": {
        "lazada": 1599,
        "shopee": 9876
      },
      "apr": {
        "lazada": 1092,
        "shopee": 9131,
        "tiktok": 7
      },
      "may": {
        "lazada": 811,
        "shopee": 9088,
        "tiktok": 214
      }
    },
    "Chang Choice - IN notax": {
      "may": {
        "lazada": 3,
        "shopee": 37
      }
    },
    "Clarins-CMG": {
      "jan": {
        "lazada": 937
      },
      "feb": {
        "lazada": 1138
      },
      "mar": {
        "lazada": 2369
      },
      "apr": {
        "lazada": 849,
        "shopee": 639
      },
      "may": {
        "lazada": 803,
        "shopee": 922
      }
    },
    "Crocs-CMG": {
      "jan": {
        "lazada": 1645,
        "shopee": 22705,
        "tiktok": 7787
      },
      "feb": {
        "lazada": 1600,
        "shopee": 22100,
        "tiktok": 6728
      },
      "mar": {
        "lazada": 3759,
        "shopee": 20217,
        "tiktok": 8826
      },
      "apr": {
        "lazada": 3329,
        "shopee": 26854,
        "tiktok": 8679
      },
      "may": {
        "lazada": 1532,
        "shopee": 17984,
        "tiktok": 7164
      }
    },
    "Decathlon Thailand": {
      "jan": {
        "shopee": 19681
      },
      "feb": {
        "shopee": 17633
      },
      "mar": {
        "shopee": 30880
      },
      "apr": {
        "shopee": 31251
      },
      "may": {
        "shopee": 29656
      }
    },
    "FILA-CMG": {
      "jan": {
        "lazada": 50,
        "shopee": 939
      }
    },
    "FitFlop - CMG": {
      "jan": {
        "lazada": 1318,
        "shopee": 11076
      },
      "feb": {
        "lazada": 1369,
        "shopee": 11066
      },
      "mar": {
        "lazada": 2150,
        "shopee": 10584
      },
      "apr": {
        "lazada": 1041,
        "shopee": 8945
      },
      "may": {
        "lazada": 1110,
        "shopee": 7606
      }
    },
    "G2000 - CMG": {
      "jan": {
        "lazada": 746,
        "shopee": 3438
      },
      "feb": {
        "lazada": 849,
        "shopee": 3779
      },
      "mar": {
        "lazada": 1079,
        "shopee": 3418
      },
      "apr": {
        "lazada": 908,
        "shopee": 3421
      },
      "may": {
        "lazada": 734,
        "shopee": 2611
      }
    },
    "Guess-CMG TH": {
      "jan": {
        "lazada": 614,
        "shopee": 4483
      },
      "feb": {
        "lazada": 673,
        "shopee": 5675
      },
      "mar": {
        "lazada": 1052,
        "shopee": 5485
      },
      "apr": {
        "lazada": 864,
        "shopee": 7419
      },
      "may": {
        "lazada": 513,
        "shopee": 5324
      }
    },
    "HERA - Amore": {
      "may": {
        "lazada": 46,
        "shopee": 432
      },
      "jan": {
        "tiktok": 13
      }
    },
    "Hey Dude-CMG": {
      "jan": {
        "lazada": 43,
        "shopee": 500
      },
      "feb": {
        "lazada": 40,
        "shopee": 474
      },
      "mar": {
        "lazada": 46,
        "shopee": 400
      }
    },
    "Hill's-IN": {
      "jan": {
        "lazada": 729,
        "shopee": 4133
      },
      "feb": {
        "lazada": 694,
        "shopee": 4247
      },
      "mar": {
        "lazada": 1168,
        "shopee": 5444
      },
      "apr": {
        "lazada": 683,
        "shopee": 4613
      },
      "may": {
        "lazada": 558,
        "shopee": 3624
      }
    },
    "Hush Puppies - CMG": {
      "jan": {
        "lazada": 417,
        "shopee": 2999
      },
      "feb": {
        "lazada": 446,
        "shopee": 3247
      },
      "mar": {
        "lazada": 616,
        "shopee": 3854
      },
      "apr": {
        "lazada": 420,
        "shopee": 3242
      },
      "may": {
        "lazada": 379,
        "shopee": 2949
      }
    },
    "JDE-IN": {
      "jan": {
        "lazada": 2674,
        "shopee": 21738
      },
      "feb": {
        "lazada": 3766,
        "shopee": 26659
      },
      "mar": {
        "lazada": 7543,
        "shopee": 32969
      },
      "apr": {
        "lazada": 4370,
        "shopee": 28579
      },
      "may": {
        "lazada": 4280,
        "shopee": 21023
      }
    },
    "Jockey - CMG": {
      "jan": {
        "lazada": 448,
        "shopee": 2251
      },
      "feb": {
        "lazada": 411,
        "shopee": 2398
      },
      "mar": {
        "lazada": 680,
        "shopee": 3267
      },
      "apr": {
        "lazada": 455,
        "shopee": 2790
      },
      "may": {
        "lazada": 310,
        "shopee": 1831
      }
    },
    "JUNGSAEMMOOL-CMG": {
      "jan": {
        "lazada": 1685,
        "shopee": 7959
      },
      "feb": {
        "lazada": 2013,
        "shopee": 8393
      },
      "mar": {
        "lazada": 3654,
        "shopee": 9418
      },
      "apr": {
        "lazada": 1367,
        "shopee": 7775
      },
      "may": {
        "lazada": 1109,
        "shopee": 6729
      }
    },
    "KIKO - CMG": {
      "jan": {
        "lazada": 824,
        "shopee": 4297
      },
      "feb": {
        "lazada": 871,
        "shopee": 3712
      },
      "mar": {
        "lazada": 1203,
        "shopee": 4550
      },
      "apr": {
        "lazada": 623,
        "shopee": 4287
      },
      "may": {
        "lazada": 516,
        "shopee": 3462
      }
    },
    "Laneige - Amore": {
      "apr": {
        "lazada": 969,
        "shopee": 8185
      },
      "may": {
        "lazada": 1471,
        "shopee": 12798
      }
    },
    "LEE - CMG": {
      "jan": {
        "lazada": 881,
        "shopee": 4890,
        "tiktok": 212
      },
      "feb": {
        "lazada": 759,
        "shopee": 6730,
        "tiktok": 135
      },
      "mar": {
        "lazada": 1113,
        "shopee": 5286,
        "tiktok": 189
      },
      "apr": {
        "lazada": 594,
        "shopee": 4860,
        "tiktok": 130
      },
      "may": {
        "lazada": 452,
        "shopee": 3924,
        "tiktok": 45
      }
    },
    "MEGA We Care-IN": {
      "mar": {
        "lazada": 506,
        "shopee": 4162,
        "tiktok": 571
      },
      "apr": {
        "lazada": 737,
        "shopee": 7667,
        "tiktok": 905
      },
      "may": {
        "lazada": 585,
        "shopee": 6681,
        "tiktok": 868
      }
    },
    "MLB - CMG": {
      "jan": {
        "lazada": 280,
        "shopee": 2819
      },
      "feb": {
        "lazada": 291,
        "shopee": 3413,
        "tiktok": 49
      },
      "mar": {
        "lazada": 531,
        "shopee": 3848,
        "tiktok": 234
      },
      "apr": {
        "lazada": 308,
        "shopee": 4280,
        "tiktok": 117
      },
      "may": {
        "lazada": 238,
        "shopee": 3008,
        "tiktok": 96
      }
    },
    "Pedigree & Whiskas-IN": {
      "jan": {
        "lazada": 5725,
        "shopee": 37741,
        "tiktok": 36269
      },
      "feb": {
        "lazada": 4168,
        "shopee": 40596,
        "tiktok": 29453
      },
      "mar": {
        "lazada": 7269,
        "shopee": 42310,
        "tiktok": 36229
      },
      "apr": {
        "lazada": 4001,
        "shopee": 38698,
        "tiktok": 36144
      },
      "may": {
        "lazada": 3915,
        "shopee": 29277,
        "tiktok": 29271
      }
    },
    "Milo - Nestle": {
      "may": {
        "tiktok": 1
      }
    },
    "Mondelez-IN": {
      "jan": {
        "lazada": 2500,
        "shopee": 9972,
        "tiktok": 2465
      },
      "feb": {
        "lazada": 1040,
        "shopee": 6555,
        "tiktok": 1508
      },
      "mar": {
        "lazada": 2193,
        "shopee": 8095,
        "tiktok": 5346
      },
      "apr": {
        "lazada": 1024,
        "shopee": 9767,
        "tiktok": 2357
      },
      "may": {
        "lazada": 1161,
        "shopee": 6537,
        "tiktok": 2749
      }
    },
    "Mustela": {
      "jan": {
        "lazada": 82,
        "shopee": 290
      },
      "feb": {
        "lazada": 177,
        "shopee": 1047
      },
      "mar": {
        "lazada": 295,
        "shopee": 1222
      },
      "apr": {
        "lazada": 217,
        "shopee": 1397
      },
      "may": {
        "lazada": 146,
        "shopee": 1068
      }
    },
    "Nescafe": {
      "apr": {
        "lazada": 1306
      },
      "may": {
        "lazada": 2539,
        "tiktok": 20
      }
    },
    "Nespresso": {
      "jan": {
        "tiktok": 186
      },
      "feb": {
        "tiktok": 160
      },
      "mar": {
        "tiktok": 288
      },
      "apr": {
        "tiktok": 352
      },
      "may": {
        "tiktok": 353
      }
    },
    "Nescafe Dolce Gusto-IN": {
      "jan": {
        "lazada": 1744,
        "shopee": 12492,
        "tiktok": 4285
      },
      "feb": {
        "lazada": 1366,
        "shopee": 11625,
        "tiktok": 2798
      },
      "mar": {
        "lazada": 2922,
        "shopee": 13156,
        "tiktok": 4016
      },
      "apr": {
        "lazada": 1453,
        "shopee": 11503,
        "tiktok": 3490
      },
      "may": {
        "lazada": 1064,
        "shopee": 9660,
        "tiktok": 2645
      }
    },
    "Nestle Food & Beverages Official": {
      "apr": {
        "lazada": 323,
        "shopee": 22134,
        "tiktok": 34247
      },
      "may": {
        "lazada": 501,
        "shopee": 31642,
        "tiktok": 37828
      }
    },
    "Nestle Health Science - IN": {
      "apr": {
        "lazada": 529,
        "shopee": 3625,
        "tiktok": 1087
      },
      "may": {
        "lazada": 849,
        "shopee": 5506,
        "tiktok": 1476
      }
    },
    "Nestle PetCare-IN": {
      "jan": {
        "lazada": 1632,
        "shopee": 18095,
        "tiktok": 8770
      },
      "feb": {
        "lazada": 1640,
        "shopee": 17463,
        "tiktok": 10514
      },
      "mar": {
        "lazada": 2618,
        "shopee": 22263,
        "tiktok": 15008
      },
      "apr": {
        "lazada": 1703,
        "shopee": 21397,
        "tiktok": 14229
      },
      "may": {
        "lazada": 1287,
        "shopee": 17056,
        "tiktok": 10657
      }
    },
    "[Nestle Professional] Shop at Nestle": {
      "jan": {
        "tiktok": 5751
      },
      "feb": {
        "tiktok": 5494
      },
      "mar": {
        "tiktok": 7607
      },
      "apr": {
        "tiktok": 8503
      },
      "may": {
        "tiktok": 2473
      }
    },
    "Paul Smith-CMG": {
      "jan": {
        "lazada": 194,
        "shopee": 442
      },
      "feb": {
        "lazada": 101,
        "shopee": 370
      },
      "mar": {
        "lazada": 231,
        "shopee": 279
      },
      "apr": {
        "lazada": 135,
        "shopee": 322
      },
      "may": {
        "lazada": 133,
        "shopee": 271
      }
    },
    "Polo Ralph Lauren-CMG": {
      "jan": {
        "lazada": 435,
        "shopee": 2494
      },
      "feb": {
        "lazada": 340,
        "shopee": 2103
      },
      "mar": {
        "lazada": 609,
        "shopee": 1553
      },
      "apr": {
        "lazada": 342,
        "shopee": 2038
      },
      "may": {
        "lazada": 296,
        "shopee": 1784
      }
    },
    "Dettol-IN": {
      "mar": {
        "tiktok": 28744
      },
      "apr": {
        "tiktok": 25452
      },
      "may": {
        "tiktok": 19842
      },
      "jan": {
        "tiktok": 11492
      },
      "feb": {
        "tiktok": 15271
      }
    },
    "Durex-IN": {
      "jan": {
        "tiktok": 2307
      },
      "feb": {
        "tiktok": 2382
      },
      "mar": {
        "tiktok": 3829
      },
      "apr": {
        "tiktok": 3803
      },
      "may": {
        "tiktok": 3196
      }
    },
    "Revlon-IN": {
      "jan": {
        "lazada": 1378,
        "shopee": 6364,
        "tiktok": 9401
      },
      "feb": {
        "lazada": 898,
        "shopee": 6360,
        "tiktok": 4934
      },
      "mar": {
        "lazada": 1476,
        "shopee": 7659,
        "tiktok": 6758
      },
      "apr": {
        "lazada": 856,
        "shopee": 10500,
        "tiktok": 3193
      },
      "may": {
        "lazada": 686,
        "shopee": 7556,
        "tiktok": 3473
      }
    },
    "Rinbee": {
      "jan": {
        "tiktok": 20
      },
      "feb": {
        "tiktok": 566
      },
      "mar": {
        "tiktok": 56
      },
      "apr": {
        "tiktok": 44
      },
      "may": {
        "tiktok": 4
      }
    },
    "Shark Ninja": {
      "may": {
        "lazada": 398,
        "shopee": 1795,
        "tiktok": 57
      }
    },
    "Smart-Travel": {
      "jan": {
        "lazada": 40,
        "shopee": 287
      },
      "feb": {
        "lazada": 31,
        "shopee": 276
      },
      "mar": {
        "lazada": 41,
        "shopee": 292
      }
    },
    "STIEBEL ELTRON TH": {
      "feb": {
        "tiktok": 14
      },
      "mar": {
        "tiktok": 91
      },
      "apr": {
        "tiktok": 67
      },
      "may": {
        "tiktok": 71
      }
    },
    "Sulwhasoo - Amore": {
      "mar": {
        "lazada": 1632,
        "shopee": 819
      },
      "apr": {
        "lazada": 948,
        "shopee": 2001
      },
      "may": {
        "lazada": 878,
        "shopee": 1984
      }
    },
    "The North Face - TOG": {
      "jan": {
        "lazada": 437,
        "shopee": 2255
      },
      "feb": {
        "lazada": 538,
        "shopee": 2315
      },
      "mar": {
        "lazada": 740,
        "shopee": 2827
      }
    },
    "THREE - CMG": {
      "jan": {
        "lazada": 501,
        "shopee": 1210
      },
      "feb": {
        "lazada": 471,
        "shopee": 1261
      },
      "mar": {
        "lazada": 1282,
        "shopee": 1592
      },
      "apr": {
        "lazada": 451,
        "shopee": 1326
      },
      "may": {
        "lazada": 339,
        "shopee": 1245
      }
    },
    "Tinder-IN": {
      "jan": {
        "lazada": 1398,
        "shopee": 5090
      },
      "feb": {
        "lazada": 1574,
        "shopee": 4301
      },
      "mar": {
        "lazada": 2048,
        "shopee": 5116
      },
      "apr": {
        "lazada": 1997,
        "shopee": 5281
      },
      "may": {
        "lazada": 1066,
        "shopee": 3770
      }
    },
    "Tommy Hilfiger-MY PVH": {
      "jan": {
        "lazada": 897,
        "shopee": 662
      },
      "feb": {
        "lazada": 786,
        "shopee": 853
      },
      "mar": {
        "lazada": 1357,
        "shopee": 860
      },
      "apr": {
        "lazada": 777,
        "shopee": 978
      },
      "may": {
        "lazada": 608,
        "shopee": 753
      }
    },
    "ULTIMA II-IN": {
      "jan": {
        "lazada": 19,
        "shopee": 69,
        "tiktok": 49
      },
      "feb": {
        "lazada": 17,
        "shopee": 66,
        "tiktok": 72
      },
      "mar": {
        "lazada": 29,
        "shopee": 65,
        "tiktok": 51
      },
      "apr": {
        "lazada": 15,
        "shopee": 101,
        "tiktok": 62
      },
      "may": {
        "lazada": 12,
        "shopee": 59,
        "tiktok": 68
      }
    },
    "Wrangler - CMG": {
      "jan": {
        "lazada": 421,
        "shopee": 3903,
        "tiktok": 138
      },
      "feb": {
        "lazada": 475,
        "shopee": 6275,
        "tiktok": 186
      },
      "mar": {
        "lazada": 733,
        "shopee": 5958,
        "tiktok": 138
      },
      "apr": {
        "lazada": 352,
        "shopee": 3527,
        "tiktok": 73
      },
      "may": {
        "lazada": 287,
        "shopee": 3359,
        "tiktok": 31
      }
    }
  }
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ...SNAPSHOT,
    lastSyncAt: new Date().toISOString(),
    snapshotGeneratedAt: "2026-05-24T00:00:00Z",
  });
}

// ─── Long-term: live Redshift connection ────────────────────────────────────
// Vercel env vars to add: REDSHIFT_HOST, REDSHIFT_DATABASE, REDSHIFT_USER,
//                        REDSHIFT_PASSWORD, REDSHIFT_PORT (default 5439).
// Library: pg (PostgreSQL client works with Redshift).
// SQL: roughly equivalent to:
//   SELECT shop_name, channel_name, EXTRACT(MONTH FROM date)::int as m,
//          SUM(shop_orders) as orders
//   FROM crea_reporting.t_crea_all_perf_w_target
//   WHERE country = 'TH'
//     AND date >= $1 AND date <= $2
//     AND service_model IN ('Retail','Service')
//     AND channel_name IN ('Shopee','Lazada','TikTok')
//     AND shop_orders > 0
//   GROUP BY shop_name, channel_name, EXTRACT(MONTH FROM date)
//   HAVING SUM(shop_orders) > 0;
// Then map shop_name → brand_name + group using SHOP_TO_BRAND below.
