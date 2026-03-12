const G20_PRE_LCI_EU_CHANNELS = [
  {
    id: 1,
    label: "Low Beam",
    shapes: [
      { type: "polygon", points: "192.784 82.302 265.999 89.676 277.061 121.807 214.906 116.013" },
      { type: "polygon", points: "412.958 103.964 486.173 111.338 497.235 143.469 435.08 137.675" }
    ]
  },
  {
    id: 2,
    label: "DRL Phase 1",
    shapes: [
      { type: "polygon", points: "106.927 73.874 129.049 78.088 113.774 96.524 164.34 162.892 184.883 175.533 312.879 183.434 324.993 195.549 192.784 188.175 171.188 181.854 142.744 164.472 95.865 115.486 85.857 94.943" },
      { type: "polygon", points: "399.262 99.158 412.958 101.791 399.263 120.753 444.035 177.113 464.577 189.755 625.23 198.71 631.551 209.771 473.005 202.923 445.088 190.809 416.645 166.052 387.148 123.914 387.148 113.906" }
    ]
  },
  { id: 3, label: "DRL Phase 2", physicalLight: 2 },
  {
    id: 4,
    label: "Blue Accent Phase 1",
    shapes: [
      { type: "polygon", points: "148.38 97.278 154.947 97.804 186.206 126.698 192.51 129.325 260.544 128.274 255.553 131.164 191.459 132.477 179.639 128.8", color: "#0000ffba" },
      { type: "polygon", points: "417.1 140.883 429.446 148.763 497.217 149.026 493.802 154.542 430.759 154.017 421.565 148.238", color: "#0000ffba" }
    ]
  },
  { id: 5, label: "Blue Accent Phase 2", physicalLight: 4 }
];

const G30_EU_CHANNELS = [
  {
    id: 1,
    label: "Low Beam",
    shapes: [
      { type: "polygon", points: "184.2 85.8 259.6 89.8 265.4 124.6 262.2 132 213.8 143.6 192 141.6 179.8 125 175 99.4" },
      { type: "polygon", points: "400.4 100.8 464.6 104.2 466.6 135 460.2 146.8 400.6 155.8 385.2 128.4 383.8 111.8 391.8 102.8" }
    ]
  },
  {
    id: 2,
    label: "DRL Phase 1",
    shapes: [
      { type: "polygon", points: "317.4 92 357.2 104 408.6 165.2 416.4 171.2 657.4 170.2 667.2 186 662.2 189 408.8 191 369.6 184.6 288.2 100.6 299.8 95.2" },
      { type: "polygon", points: "119.2 78.8 156.4 95.2 208.4 161.8 340.8 165.8 359.4 181.8 346.6 195 179.8 190.4 82.4 86.2 85.8 79.8 109 73.6" }
    ]
  },
  { id: 3, label: "DRL Phase 2", physicalLight: 2 },
  {
    id: 4,
    label: "Blue Accent Phase 1",
    shapes: [
      { type: "polygon", points: "", color: "#0000ffba" },
      { type: "polygon", points: "", color: "#0000ffba" }
    ]
  },
  { id: 5, label: "Blue Accent Phase 2", physicalLight: 4 }
];

const G80_EU_CHANNELS = [
  {
    id: 1,
    label: "Low Beam",
    shapes: [
      { type: "polygon", points: "165.25 106.75 168.5 98.25 197 94.25 222.75 94.25 224.75 118.75 178.5 123.5" },
      { type: "polygon", points: "383 108.5 425.5 104 433 127.75 389.75 134.25 377.5 117.75" }
    ]
  },
  {
    id: 2,
    label: "DRL Phase 1",
    shapes: [
      { type: "polygon", points: "127.33 78 111.67 100.33 147.33 160.33 239.33 168.33 268.33 147 281.67 144.33 307.67 163.33 272.67 191.67 147.67 179.67 83.67 92.33 101.67 66.67 114.33 66.33" },
      { type: "polygon", points: "345 96.5 319.5 120.25 356.75 174 432.25 172 459.75 149.25 473.25 149.5 515.5 166.25 480.75 195.75 361 195 322.25 177.75 274.25 111.5 311.75 90.75 329 87.25" }
    ]
  },
  { id: 3, label: "DRL Phase 2", physicalLight: 2 },
  {
    id: 4,
    label: "Blue Accent Phase 1",
    shapes: [
      { type: "polygon", points: "167.4 114.2 180 124.8 231.4 120 240.8 125.4 174 136.2 141.8 123.2 144 116.2 155.4 119.2 160.2 114", color: "#0000ffba" },
      { type: "polygon", points: "368.8 124.2 376.2 124.2 384.8 133 392 137.6 434.4 129.6 443.4 138.2 387.6 148.2 344 137.8 355.4 130.4", color: "#0000ffba" }
    ]
  },
  { id: 5, label: "Blue Accent Phase 2", physicalLight: 4 }
];

const VEHICLE_CONFIGS = {
  generic: {
    name: "Generic",
    type: "grid"
  },
  "bmw-g20-2020-laser": {
    name: "BMW G20 2020 Laser",
    type: "image",
    image: "assets/bmw_g20_2020_eu_laser.png",
    viewBox: "0 0 720 304",
    baseSide: "left",
    phases: [
      { name: "Phase 1", channels: [1, 2, 4], maxDuration: 20000 },
      { name: "Phase 2", channels: [3, 5], anchor: 20000, maxDuration: null }
    ],
    defaultStates: {
      2: { brightness: 67, rampUp: 2000, rampDown: 2000 },
      4: { brightness: 46, rampUp: 2000, rampDown: 2000 }
    },
    channels: G20_PRE_LCI_EU_CHANNELS
  },
  "bmw-g22-2020-laser": {
    name: "BMW G22 2020 Laser",
    type: "image",
    image: "assets/bmw_g80_2020_eu_laser.png",
    viewBox: "0 0 720 304",
    baseSide: "left",
    channels: G80_EU_CHANNELS
  },
  "bmw-g30-2020-laser": {
    name: "BMW G30 2020 EU Laser",
    type: "image",
    image: "assets/bmw_g30_2020_eu_laser.png",
    viewBox: "0 0 720 304",
    baseSide: "left",
    channels: G30_EU_CHANNELS
  },
  "bmw-g80-2022-laser": {
    name: "BMW G80 2022 EU Laser",
    type: "image",
    image: "assets/bmw_g80_2020_eu_laser.png",
    viewBox: "0 0 720 304",
    baseSide: "left",
    channels: G80_EU_CHANNELS
  },
  "bmw-g82-2022-laser": {
    name: "BMW G82 2022 EU Laser",
    type: "image",
    image: "assets/bmw_g80_2020_eu_laser.png",
    viewBox: "0 0 720 304",
    baseSide: "left",
    channels: G80_EU_CHANNELS
  }
};
