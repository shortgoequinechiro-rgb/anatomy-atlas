/* =====================================================================
   Human Anatomy Atlas — Anatomy Data Model
   ---------------------------------------------------------------------
   ORIGINAL WORK. This catalog and the placeholder geometry it drives are
   authored from scratch. No third-party app data, code, or proprietary
   model is used. Real open-licensed models (Z-Anatomy / BodyParts3D,
   CC-BY-SA) plug in later via the GLB loader — see README.

   Hierarchy:  System  ->  Region  ->  Structure

   Each Structure may carry a `build` spec that js/body-model.js consumes
   to generate a selectable placeholder mesh. Keeping the build spec next
   to the catalog entry guarantees the 3D scene and the data stay in sync:
   every catalog entry has a mesh, and every mesh maps back to an entry.

   build.shape:
     'box'      args:[w,h,d]
     'sphere'   args:[radius]
     'cylinder' args:[radiusTop, radiusBottom, height]
     'ellipsoid'args:[rx,ry,rz]           (a scaled sphere)
     'spine'    args:[yTop, yBottom, count, radius]
     'ribcage'  args:[yTop, yBottom, pairs, halfWidth, depth]
     'hand'     args:[]   (palm + fingers, sized internally)
     'foot'     args:[]   (wedge + toes)
   Common: pos:[x,y,z]  rot:[x,y,z](radians)  mirror:true (also mirror on -X)

   Coordinate system: Y up, figure standing. Feet at y≈0, crown at y≈1.78.
   X is the subject's left(+)/right(-) ... we keep it symmetric so it reads
   either way. Z+ is anterior (front of the body).
   ===================================================================== */

(function () {
  const D = (deg) => (deg * Math.PI) / 180;

  const SYSTEMS = [
    /* ============================ SKELETAL ============================ */
    {
      id: "skeletal",
      name: "Skeletal System",
      color: 0xeae2d0,
      blurb:
        "The 206 bones of the adult skeleton — the body's rigid framework. Provides support, protects organs, anchors muscles, stores minerals, and houses marrow.",
      regions: [
        {
          id: "skull",
          name: "Skull & Head",
          structures: [
            {
              id: "cranium",
              name: "Cranium",
              latin: "Calvaria",
              description:
                "The domed upper portion of the skull that encloses and protects the brain. Formed from the frontal, parietal, temporal, and occipital bones fused at sutures.",
              build: { shape: "ellipsoid", args: [0.095, 0.11, 0.105], pos: [0, 1.66, 0.005] },
            },
            {
              id: "mandible",
              name: "Mandible",
              latin: "Mandibula",
              description:
                "The lower jaw — the only freely movable bone of the skull. Carries the lower teeth and hinges at the temporomandibular joint to enable chewing and speech.",
              build: { shape: "box", args: [0.12, 0.05, 0.09], pos: [0, 1.565, 0.02] },
            },
            {
              id: "maxilla",
              name: "Maxilla & Face",
              latin: "Maxilla",
              description:
                "The fixed upper jaw and mid-face. Holds the upper teeth, forms the floor of the orbits and most of the hard palate, and shapes the cheek and nasal region.",
              build: { shape: "box", args: [0.115, 0.06, 0.085], pos: [0, 1.62, 0.03] },
            },
          ],
        },
        {
          id: "spine",
          name: "Vertebral Column",
          structures: [
            {
              id: "cervical-spine",
              name: "Cervical Spine (C1–C7)",
              latin: "Vertebrae cervicales",
              description:
                "The seven neck vertebrae. The most mobile region of the spine; C1 (atlas) and C2 (axis) allow the head to nod and rotate.",
              build: { shape: "spine", args: [1.55, 1.43, 7, 0.022], pos: [0, 0, -0.02] },
            },
            {
              id: "thoracic-spine",
              name: "Thoracic Spine (T1–T12)",
              latin: "Vertebrae thoracicae",
              description:
                "Twelve mid-back vertebrae, each articulating with a pair of ribs. Naturally curved (kyphotic) and relatively rigid to protect the thoracic organs.",
              build: { shape: "spine", args: [1.42, 1.04, 12, 0.026], pos: [0, 0, -0.03] },
            },
            {
              id: "lumbar-spine",
              name: "Lumbar Spine (L1–L5)",
              latin: "Vertebrae lumbales",
              description:
                "Five large lower-back vertebrae that bear most of the body's weight. Built for load rather than mobility; a common site of disc problems.",
              build: { shape: "spine", args: [1.03, 0.92, 5, 0.03], pos: [0, 0, -0.03] },
            },
            {
              id: "sacrum",
              name: "Sacrum & Coccyx",
              latin: "Os sacrum",
              description:
                "Five fused vertebrae forming a triangular wedge at the base of the spine, transmitting weight into the pelvis. The coccyx (tailbone) hangs below it.",
              build: { shape: "box", args: [0.07, 0.12, 0.05], pos: [0, 0.86, -0.03] },
            },
          ],
        },
        {
          id: "thorax",
          name: "Thorax",
          structures: [
            {
              id: "ribcage",
              name: "Rib Cage",
              latin: "Cavea thoracis",
              description:
                "Twelve pairs of ribs forming a protective, expandable cage around the heart and lungs. Movement of the ribs drives the mechanics of breathing.",
              build: { shape: "ribcage", args: [1.39, 1.06, 10, 0.16, 0.13], pos: [0, 0, 0] },
            },
            {
              id: "sternum",
              name: "Sternum",
              latin: "Sternum",
              description:
                "The flat breastbone at the front of the chest. The upper ribs join it via costal cartilage; it is the landmark for chest compressions in CPR.",
              build: { shape: "box", args: [0.035, 0.17, 0.02], pos: [0, 1.24, 0.125] },
            },
          ],
        },
        {
          id: "pelvis",
          name: "Pelvis",
          structures: [
            {
              id: "hip-bone",
              name: "Hip Bone (Pelvic Girdle)",
              latin: "Os coxae",
              description:
                "The basin of bone (ilium, ischium, pubis) that connects the spine to the legs, supports the abdominal organs, and forms the hip sockets.",
              build: { shape: "box", args: [0.26, 0.13, 0.13], pos: [0, 0.84, 0] },
            },
          ],
        },
        {
          id: "upper-limb",
          name: "Upper Limb",
          structures: [
            {
              id: "clavicle",
              name: "Clavicle",
              latin: "Clavicula",
              description:
                "The collarbone — an S-shaped strut bracing the shoulder away from the chest. The most commonly fractured bone in the body.",
              build: { shape: "cylinder", args: [0.012, 0.012, 0.16], pos: [0.09, 1.45, 0.07], rot: [0, 0, D(78)], mirror: true },
            },
            {
              id: "scapula",
              name: "Scapula",
              latin: "Scapula",
              description:
                "The shoulder blade — a flat triangular bone that glides over the rib cage and forms half of the highly mobile shoulder joint.",
              build: { shape: "box", args: [0.10, 0.13, 0.02], pos: [0.13, 1.35, -0.09], mirror: true },
            },
            {
              id: "humerus",
              name: "Humerus",
              latin: "Humerus",
              description:
                "The single long bone of the upper arm, running from the shoulder to the elbow. Its lower end forms the elbow joint with the radius and ulna.",
              build: { shape: "cylinder", args: [0.022, 0.018, 0.30], pos: [0.20, 1.27, 0], mirror: true },
            },
            {
              id: "radius-ulna",
              name: "Radius & Ulna",
              latin: "Radius et ulna",
              description:
                "The two forearm bones. The radius rotates around the ulna to turn the palm up and down (pronation/supination).",
              build: { shape: "cylinder", args: [0.016, 0.014, 0.26], pos: [0.205, 0.98, 0.01], mirror: true },
            },
            {
              id: "hand",
              name: "Hand & Wrist",
              latin: "Manus",
              description:
                "Twenty-seven bones — carpals, metacarpals, and phalanges — giving the hand its dexterity and the opposable thumb its grip.",
              build: { shape: "hand", args: [], pos: [0.205, 0.80, 0.02], mirror: true },
            },
          ],
        },
        {
          id: "lower-limb",
          name: "Lower Limb",
          structures: [
            {
              id: "femur",
              name: "Femur",
              latin: "Femur",
              description:
                "The thigh bone — the longest, strongest bone in the body. Its ball-shaped head sits in the hip socket; its lower end forms the knee.",
              build: { shape: "cylinder", args: [0.028, 0.024, 0.42], pos: [0.09, 0.66, 0], mirror: true },
            },
            {
              id: "patella",
              name: "Patella",
              latin: "Patella",
              description:
                "The kneecap — a sesamoid bone embedded in the quadriceps tendon. It protects the knee joint and improves the leverage of the thigh muscles.",
              build: { shape: "box", args: [0.04, 0.045, 0.02], pos: [0.09, 0.45, 0.06], mirror: true },
            },
            {
              id: "tibia-fibula",
              name: "Tibia & Fibula",
              latin: "Tibia et fibula",
              description:
                "The two bones of the lower leg. The tibia (shin) bears weight; the slender fibula stabilizes the ankle and anchors muscles.",
              build: { shape: "cylinder", args: [0.022, 0.016, 0.40], pos: [0.09, 0.24, 0], mirror: true },
            },
            {
              id: "foot",
              name: "Foot & Ankle",
              latin: "Pes",
              description:
                "Twenty-six bones forming the arches that support body weight and act as a lever for walking and running.",
              build: { shape: "foot", args: [], pos: [0.09, 0.03, 0.03], mirror: true },
            },
          ],
        },
      ],
    },

    /* ============================ MUSCULAR ============================ */
    {
      id: "muscular",
      name: "Muscular System",
      color: 0xb04a40,
      opacity: 0.55,
      blurb:
        "Over 600 skeletal muscles that move the body, maintain posture, and generate heat. Shown here as translucent volumes over the skeleton.",
      regions: [
        {
          id: "trunk-muscles",
          name: "Trunk",
          structures: [
            {
              id: "pectoralis",
              name: "Pectoralis Major",
              latin: "Musculus pectoralis major",
              description:
                "The large fan-shaped chest muscle. Pulls the arm across the body and forward — used in pushing, throwing, and bench pressing.",
              build: { shape: "box", args: [0.13, 0.12, 0.05], pos: [0.07, 1.28, 0.12], mirror: true },
            },
            {
              id: "rectus-abdominis",
              name: "Rectus Abdominis",
              latin: "Musculus rectus abdominis",
              description:
                "The paired 'six-pack' muscle running down the front of the abdomen. Flexes the trunk and stabilizes the core.",
              build: { shape: "box", args: [0.13, 0.22, 0.05], pos: [0, 1.05, 0.13] },
            },
            {
              id: "trapezius",
              name: "Trapezius",
              latin: "Musculus trapezius",
              description:
                "The large diamond-shaped muscle of the upper back and neck. Shrugs the shoulders, rotates the scapula, and supports the head.",
              build: { shape: "box", args: [0.30, 0.18, 0.05], pos: [0, 1.36, -0.10] },
            },
          ],
        },
        {
          id: "arm-muscles",
          name: "Arm",
          structures: [
            {
              id: "deltoid",
              name: "Deltoid",
              latin: "Musculus deltoideus",
              description:
                "The rounded muscle that caps the shoulder. Lifts the arm away from the body in every direction and gives the shoulder its contour.",
              build: { shape: "ellipsoid", args: [0.06, 0.07, 0.06], pos: [0.20, 1.42, 0], mirror: true },
            },
            {
              id: "biceps",
              name: "Biceps Brachii",
              latin: "Musculus biceps brachii",
              description:
                "The two-headed muscle on the front of the upper arm. Bends the elbow and supinates the forearm; the classic 'flex' muscle.",
              build: { shape: "ellipsoid", args: [0.035, 0.11, 0.04], pos: [0.205, 1.27, 0.03], mirror: true },
            },
          ],
        },
        {
          id: "leg-muscles",
          name: "Leg",
          structures: [
            {
              id: "gluteus",
              name: "Gluteus Maximus",
              latin: "Musculus gluteus maximus",
              description:
                "The largest muscle in the body, forming the buttock. Extends and externally rotates the hip — essential for standing, climbing, and running.",
              build: { shape: "ellipsoid", args: [0.075, 0.09, 0.07], pos: [0.075, 0.86, -0.10], mirror: true },
            },
            {
              id: "quadriceps",
              name: "Quadriceps",
              latin: "Musculus quadriceps femoris",
              description:
                "The four-part muscle group on the front of the thigh. Straightens the knee and the only group that also flexes the hip (rectus femoris).",
              build: { shape: "ellipsoid", args: [0.055, 0.18, 0.055], pos: [0.09, 0.64, 0.04], mirror: true },
            },
            {
              id: "gastrocnemius",
              name: "Gastrocnemius",
              latin: "Musculus gastrocnemius",
              description:
                "The prominent calf muscle. Points the foot down (plantarflexion) and bends the knee; powers walking, running, and jumping.",
              build: { shape: "ellipsoid", args: [0.04, 0.13, 0.045], pos: [0.09, 0.26, -0.04], mirror: true },
            },
          ],
        },
      ],
    },

    /* ========================= CARDIOVASCULAR ========================= */
    {
      id: "cardiovascular",
      name: "Cardiovascular System",
      color: 0xc0392b,
      blurb:
        "The heart and blood vessels — a closed loop that delivers oxygen and nutrients to every cell and carries away waste. Beats ~100,000 times a day.",
      regions: [
        {
          id: "heart-region",
          name: "Heart & Great Vessels",
          structures: [
            {
              id: "heart",
              name: "Heart",
              latin: "Cor",
              description:
                "A four-chambered muscular pump about the size of a fist, sitting slightly left of center in the chest. Drives both the pulmonary and systemic circulations.",
              build: { shape: "ellipsoid", args: [0.055, 0.065, 0.05], pos: [-0.02, 1.22, 0.04], rot: [0, 0, D(15)] },
            },
            {
              id: "aorta",
              name: "Aorta",
              latin: "Aorta",
              description:
                "The body's largest artery. Arches off the top of the heart and runs down through the chest and abdomen, branching to supply the whole body.",
              build: { shape: "cylinder", args: [0.014, 0.014, 0.34], pos: [0, 1.15, -0.01] },
            },
          ],
        },
      ],
    },

    /* ========================== RESPIRATORY =========================== */
    {
      id: "respiratory",
      name: "Respiratory System",
      color: 0xe28fa6,
      opacity: 0.75,
      blurb:
        "The airway and lungs — where oxygen enters the blood and carbon dioxide leaves it. Moves roughly 11,000 liters of air a day.",
      regions: [
        {
          id: "airway",
          name: "Airway & Lungs",
          structures: [
            {
              id: "trachea",
              name: "Trachea",
              latin: "Trachea",
              description:
                "The windpipe — a flexible tube reinforced by C-shaped cartilage rings that carries air from the larynx toward the lungs, splitting into two bronchi.",
              build: { shape: "cylinder", args: [0.012, 0.012, 0.14], pos: [0, 1.45, 0.02] },
            },
            {
              id: "lung-right",
              name: "Right Lung",
              latin: "Pulmo dexter",
              description:
                "The larger lung, with three lobes. Slightly shorter than the left because the liver sits beneath it on the right side.",
              build: { shape: "ellipsoid", args: [0.07, 0.13, 0.07], pos: [-0.08, 1.26, 0.0] },
            },
            {
              id: "lung-left",
              name: "Left Lung",
              latin: "Pulmo sinister",
              description:
                "The smaller lung, with two lobes and a notch (cardiac notch) that makes room for the heart.",
              build: { shape: "ellipsoid", args: [0.065, 0.13, 0.07], pos: [0.08, 1.26, 0.0] },
            },
          ],
        },
      ],
    },

    /* =========================== DIGESTIVE ============================ */
    {
      id: "digestive",
      name: "Digestive System",
      color: 0xc6915f,
      opacity: 0.9,
      blurb:
        "The tract and glands that break food into absorbable nutrients — from the stomach and intestines to the liver. About 9 meters end to end.",
      regions: [
        {
          id: "gi-tract",
          name: "Abdominal Organs",
          structures: [
            {
              id: "stomach",
              name: "Stomach",
              latin: "Gaster",
              description:
                "A muscular J-shaped sac that churns food with acid and enzymes into a semi-liquid (chyme) before passing it to the small intestine.",
              build: { shape: "ellipsoid", args: [0.06, 0.07, 0.045], pos: [0.05, 1.02, 0.03], rot: [0, 0, D(20)] },
            },
            {
              id: "liver",
              name: "Liver",
              latin: "Hepar",
              description:
                "The largest internal organ. Filters blood, produces bile, stores energy, and performs hundreds of metabolic and detoxifying tasks.",
              build: { shape: "box", args: [0.16, 0.07, 0.10], pos: [-0.03, 1.06, 0.05] },
            },
            {
              id: "small-intestine",
              name: "Small Intestine",
              latin: "Intestinum tenue",
              description:
                "A ~6-meter coiled tube where most digestion and nutrient absorption occur. Its lining is folded into millions of villi to maximize surface area.",
              build: { shape: "ellipsoid", args: [0.10, 0.08, 0.07], pos: [0, 0.93, 0.05] },
            },
            {
              id: "large-intestine",
              name: "Large Intestine",
              latin: "Intestinum crassum",
              description:
                "The colon — frames the small intestine and reabsorbs water and salts, compacting waste into stool before elimination.",
              build: { shape: "box", args: [0.18, 0.16, 0.08], pos: [0, 0.95, 0.03] },
            },
          ],
        },
      ],
    },

    /* ============================ NERVOUS ============================= */
    {
      id: "nervous",
      name: "Nervous System",
      color: 0xe9d8a6,
      blurb:
        "The brain, spinal cord, and nerves — the body's control and communication network, processing sensation and directing every movement and thought.",
      regions: [
        {
          id: "cns",
          name: "Central Nervous System",
          structures: [
            {
              id: "brain",
              name: "Brain",
              latin: "Encephalon",
              description:
                "The control center of the body, housing ~86 billion neurons. Governs thought, emotion, memory, sensation, and the coordination of movement.",
              build: { shape: "ellipsoid", args: [0.075, 0.085, 0.085], pos: [0, 1.65, 0.005] },
            },
            {
              id: "spinal-cord",
              name: "Spinal Cord",
              latin: "Medulla spinalis",
              description:
                "The bundle of nerve fibers running through the vertebral canal, relaying signals between brain and body and driving reflexes.",
              build: { shape: "cylinder", args: [0.01, 0.01, 0.62], pos: [0, 1.22, -0.025] },
            },
          ],
        },
      ],
    },

    /* ============================= URINARY ============================ */
    {
      id: "urinary",
      name: "Urinary System",
      color: 0x9c6239,
      blurb:
        "The kidneys, bladder, and connecting tubes that filter blood, balance fluids and electrolytes, and remove waste as urine.",
      regions: [
        {
          id: "renal",
          name: "Kidneys & Bladder",
          structures: [
            {
              id: "kidney-right",
              name: "Right Kidney",
              latin: "Ren dexter",
              description:
                "A bean-shaped filter that cleans blood, regulates blood pressure and pH, and produces urine. The right kidney sits slightly lower than the left.",
              build: { shape: "ellipsoid", args: [0.03, 0.05, 0.025], pos: [-0.07, 0.98, -0.04] },
            },
            {
              id: "kidney-left",
              name: "Left Kidney",
              latin: "Ren sinister",
              description:
                "The left of the paired filtering organs, tucked high against the back wall of the abdomen beneath the diaphragm.",
              build: { shape: "ellipsoid", args: [0.03, 0.05, 0.025], pos: [0.07, 1.00, -0.04] },
            },
            {
              id: "bladder",
              name: "Urinary Bladder",
              latin: "Vesica urinaria",
              description:
                "A muscular, expandable sac that stores urine until release. It can hold roughly 400–600 ml in a comfortable adult.",
              build: { shape: "ellipsoid", args: [0.04, 0.04, 0.035], pos: [0, 0.86, 0.05] },
            },
          ],
        },
      ],
    },
  ];

  /* ---- Flatten into a lookup index used by the app ---- */
  const STRUCTURE_INDEX = {}; // id -> { ...structure, systemId, systemName, regionId, regionName, color, opacity }
  SYSTEMS.forEach((sys) => {
    sys.regions.forEach((reg) => {
      reg.structures.forEach((st) => {
        STRUCTURE_INDEX[st.id] = Object.assign({}, st, {
          systemId: sys.id,
          systemName: sys.name,
          systemColor: sys.color,
          systemOpacity: sys.opacity || 1,
          regionId: reg.id,
          regionName: reg.name,
        });
      });
    });
  });

  window.ANATOMY = { systems: SYSTEMS, index: STRUCTURE_INDEX, deg: D };
})();
