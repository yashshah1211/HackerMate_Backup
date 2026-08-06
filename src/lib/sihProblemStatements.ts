export interface SIHProblemStatement {
  id: string;
  title: string;
  category: "software" | "hardware";
  organization: string;
  theme: string;
}

export const SIH_PROBLEM_STATEMENTS: SIHProblemStatement[] = [
  {
    id: "SIH1524",
    title: "Smart Industrial Automation & Autonomous Process Optimization Engine",
    category: "software",
    organization: "Ministry of Heavy Industries",
    theme: "Smart Automation",
  },
  {
    id: "SIH1789",
    title: "AI-Powered E-Waste Segregation & Clean Green Technology Material Recovery",
    category: "hardware",
    organization: "Ministry of Environment, Forest & Climate Change",
    theme: "Clean & Green Technology",
  },
  // ==========================================
  // 1. Ministry of Railways
  // ==========================================
  {
    id: "SIH1280",
    title: "AI-based Automatic Track Inspection and Defect Detection System using Computer Vision",
    category: "software",
    organization: "Ministry of Railways",
    theme: "Transportation & Logistics",
  },
  {
    id: "SIH1281",
    title: "Real-time Crowd Density Monitoring and Passenger Flow Optimization at Major Railway Junctions",
    category: "software",
    organization: "Ministry of Railways",
    theme: "Smart Automation",
  },
  {
    id: "SIH1282",
    title: "IoT-based Predictive Maintenance for Railway Rolling Stock Axles and Bearings",
    category: "hardware",
    organization: "Ministry of Railways",
    theme: "Robotics & Maintenance",
  },
  {
    id: "SIH1283",
    title: "Automated Overhead Equipment (OHE) Wire Fault Detection System using Sensor Arrays",
    category: "hardware",
    organization: "Ministry of Railways",
    theme: "Clean Energy & Power",
  },
  {
    id: "SIH1365",
    title: "Automated Railway Platform Announcement System with Indian Sign Language Video",
    category: "software",
    organization: "Ministry of Railways",
    theme: "Accessibility",
  },
  {
    id: "SIH1375",
    title: "Automated Railway Ticket Counter Counterfeit Currency Detection System",
    category: "hardware",
    organization: "Ministry of Railways",
    theme: "Hardware Security",
  },
  {
    id: "SIH1401",
    title: "AI-Based Automatic Signal Passed At Danger (SPAD) Warning & Emergency Braking System",
    category: "hardware",
    organization: "Ministry of Railways",
    theme: "Rail Safety & Hardware",
  },
  {
    id: "SIH1402",
    title: "Smart Solar-Powered Railway Coach Ventilation & Thermal Insulation System",
    category: "hardware",
    organization: "Ministry of Railways",
    theme: "Clean Energy & Transit",
  },
  {
    id: "SIH1403",
    title: "Dynamic Freight Wagon Load Distribution Sensor & Overloading Alarm Network",
    category: "hardware",
    organization: "Ministry of Railways",
    theme: "Logistics & IoT",
  },
  {
    id: "SIH1404",
    title: "AI-Powered Rail Coach Cleanliness Auditing System using Camera Feeds",
    category: "software",
    organization: "Ministry of Railways",
    theme: "Smart Cities & Hygiene",
  },

  // ==========================================
  // 2. Ministry of Defence / DRDO / Armed Forces
  // ==========================================
  {
    id: "SIH1284",
    title: "Secure Autonomous Drone Swarm Communication Network for Border Surveillance",
    category: "hardware",
    organization: "Ministry of Defence",
    theme: "Robotics & Defense",
  },
  {
    id: "SIH1285",
    title: "AI-Powered Real-Time Deepfake Detection in Satellite Imagery and Video Feeds",
    category: "software",
    organization: "DRDO",
    theme: "Cyber Security & AI",
  },
  {
    id: "SIH1286",
    title: "Wearable Health Monitoring System for High-Altitude Military Personnel",
    category: "hardware",
    organization: "Indian Army / Ministry of Defence",
    theme: "MedTech & Hardware",
  },
  {
    id: "SIH1287",
    title: "Encrypted Mesh Communication Protocol for Tactical Field Operations",
    category: "software",
    organization: "Ministry of Defence",
    theme: "Cyber Security",
  },
  {
    id: "SIH1405",
    title: "Low-Light Thermal Computer Vision Engine for Perimeter Intrusion Detection",
    category: "software",
    organization: "DRDO",
    theme: "Defense Tech & AI",
  },
  {
    id: "SIH1406",
    title: "Portable Exoskeleton Suit for Ammunition Load Carrying in High-Altitude Terrains",
    category: "hardware",
    organization: "Indian Army",
    theme: "Robotics & Hardware",
  },
  {
    id: "SIH1407",
    title: "Counter-UAV RF Jammer Node with Directional Antenna Tracking",
    category: "hardware",
    organization: "Ministry of Defence",
    theme: "Defense Hardware",
  },
  {
    id: "SIH1408",
    title: "Secure Zero-Trust Military Supply Chain Tracking Platform using Blockchain",
    category: "software",
    organization: "Ministry of Defence",
    theme: "Blockchain & Security",
  },

  // ==========================================
  // 3. Ministry of Agriculture & Farmers Welfare
  // ==========================================
  {
    id: "SIH1288",
    title: "AI & Multispectral Satellite Image Analysis for Early Crop Stress and Pest Attack Early Warning",
    category: "software",
    organization: "Ministry of Agriculture",
    theme: "Agriculture & Rural Dev",
  },
  {
    id: "SIH1289",
    title: "Smart Solar-Powered Micro-Irrigation Automated Valve Controller",
    category: "hardware",
    organization: "Ministry of Agriculture",
    theme: "Agriculture & Hardware",
  },
  {
    id: "SIH1290",
    title: "Blockchain-based Seed Traceability and Quality Certification Platform",
    category: "software",
    organization: "Ministry of Agriculture",
    theme: "AgriTech & Blockchain",
  },
  {
    id: "SIH1291",
    title: "Dynamic Soil Health Card & Instant AI Fertilizer Recommendation Engine",
    category: "software",
    organization: "ICAR / Ministry of Agriculture",
    theme: "Agriculture & AI",
  },
  {
    id: "SIH1292",
    title: "IoT Portable Grain Moisture and Quality Tester Device for Mandis",
    category: "hardware",
    organization: "Food Corporation of India",
    theme: "Agri-Logistics",
  },
  {
    id: "SIH1352",
    title: "Portable Soil NPK (Nitrogen, Phosphorus, Potassium) Optical Sensor",
    category: "hardware",
    organization: "Ministry of Agriculture",
    theme: "AgriTech",
  },
  {
    id: "SIH1353",
    title: "Automated Crop Damage Assessment for Fast PMFBY Insurance Claim Settlement",
    category: "software",
    organization: "Ministry of Agriculture",
    theme: "Agri-Insurance & Satellite",
  },
  {
    id: "SIH1409",
    title: "AI Micro-Climate Weather Predictor for Hyper-Local Farm Yield Protection",
    category: "software",
    organization: "Ministry of Agriculture",
    theme: "AgriTech & AI",
  },
  {
    id: "SIH1410",
    title: "Autonomous Weed Identification and Targeted Laser Weeding Robot",
    category: "hardware",
    organization: "ICAR",
    theme: "Agri-Robotics",
  },
  {
    id: "SIH1411",
    title: "Direct Farmer-to-Consumer Digital Marketplace with Vernacular Voice Bidding",
    category: "software",
    organization: "Ministry of Agriculture",
    theme: "AgriTech & Marketplace",
  },
  {
    id: "SIH1412",
    title: "Smart Storage Silo Temperature & Methane Detection Sensor Node",
    category: "hardware",
    organization: "Food Corporation of India",
    theme: "Agri-Storage IoT",
  },

  // ==========================================
  // 4. Ministry of Health & Family Welfare / MedTech
  // ==========================================
  {
    id: "SIH1293",
    title: "AI-Driven Automated Screening of Chest X-Rays for Tuberculosis and Pneumonia in Rural Clinics",
    category: "software",
    organization: "Ministry of Health",
    theme: "Healthcare & MedTech",
  },
  {
    id: "SIH1294",
    title: "Non-Invasive Hemoglobin Monitoring Device for Anemia Detection in Anganwadi Centers",
    category: "hardware",
    organization: "ICMR / Ministry of Health",
    theme: "MedTech Hardware",
  },
  {
    id: "SIH1295",
    title: "Real-time Vaccine Cold Chain Temperature Tracking & Failure Alert Network",
    category: "hardware",
    organization: "National Health Mission",
    theme: "IoT & Healthcare",
  },
  {
    id: "SIH1296",
    title: "Unified Electronic Health Record (EHR) Interoperability Gateway using ABDM Standards",
    category: "software",
    organization: "National Health Authority",
    theme: "Digital Health",
  },
  {
    id: "SIH1297",
    title: "AI Mental Health Assessment Chatbot with Vernacular Audio Recognition for Students",
    category: "software",
    organization: "Ministry of Health",
    theme: "Mental Health & NLP",
  },
  {
    id: "SIH1341",
    title: "Smart Hospital Bed Availability Tracker and ICU Emergency Referral Network",
    category: "software",
    organization: "State Health Authority",
    theme: "Healthcare & Digital Services",
  },
  {
    id: "SIH1368",
    title: "AI-based Diabetic Retinopathy Screening from Smartphone Eye Images",
    category: "software",
    organization: "AIIMS / Ministry of Health",
    theme: "Healthcare & AI",
  },
  {
    id: "SIH1413",
    title: "Portable Electrocardiogram (ECG) Patch with Edge AI Arrhythmia Alert",
    category: "hardware",
    organization: "ICMR",
    theme: "MedTech Hardware",
  },
  {
    id: "SIH1414",
    title: "Automated Counterfeit Drug Verification System using QR Cryptographic Watermarks",
    category: "software",
    organization: "CDSCO / Ministry of Health",
    theme: "Pharma & Security",
  },
  {
    id: "SIH1415",
    title: "IoT Ambulance Traffic Green-Corridor Preemption Router with Patient Telemetry",
    category: "hardware",
    organization: "National Health Mission",
    theme: "Smart Healthcare Transit",
  },
  {
    id: "SIH1416",
    title: "AI-Based Early Detection of Cervical Cancer from Pap Smear Microscopic Slides",
    category: "software",
    organization: "Ministry of Health",
    theme: "MedTech & AI",
  },

  // ==========================================
  // 5. Ministry of Education / AICTE / EdTech
  // ==========================================
  {
    id: "SIH1298",
    title: "Automated Plagiarism and AI-Generated Content Detection for Academic Submissions",
    category: "software",
    organization: "AICTE / Ministry of Education",
    theme: "Smart Education",
  },
  {
    id: "SIH1299",
    title: "Interactive AR/VR Physics and Chemistry Lab Simulator for Rural Schools",
    category: "software",
    organization: "Ministry of Education",
    theme: "EdTech & AR/VR",
  },
  {
    id: "SIH1300",
    title: "Outcome-Based Education (OBE) Curriculum Mapping and Skill Gap Analyzer",
    category: "software",
    organization: "AICTE",
    theme: "Smart Education",
  },
  {
    id: "SIH1301",
    title: "Gamified Multilingual Literacy & Numeracy Mobile Platform for Primary Students",
    category: "software",
    organization: "NCERT / Ministry of Education",
    theme: "EdTech & Vernacular",
  },
  {
    id: "SIH1417",
    title: "AI Personalised Adaptive Learning Companion for Engineering Students",
    category: "software",
    organization: "AICTE",
    theme: "EdTech & AI",
  },
  {
    id: "SIH1418",
    title: "Low-Cost Haptic Braille Display Reader for Visually Impaired Students",
    category: "hardware",
    organization: "Ministry of Education",
    theme: "Accessibility Hardware",
  },
  {
    id: "SIH1419",
    title: "Automated Student Dropout Risk Early Warning Engine using Attendance Analytics",
    category: "software",
    organization: "Ministry of Education",
    theme: "Education Analytics",
  },
  {
    id: "SIH1420",
    title: "AI Video Lecture Translator and Subtitle Generator for 22 Regional Languages",
    category: "software",
    organization: "SWAYAM / Ministry of Education",
    theme: "EdTech & NLP",
  },

  // ==========================================
  // 6. ISRO / Department of Space
  // ==========================================
  {
    id: "SIH1302",
    title: "Automated Feature Extraction from High-Resolution Oceansat Satellite Imagery",
    category: "software",
    organization: "ISRO / NRSC",
    theme: "Space Tech & Geospatial",
  },
  {
    id: "SIH1303",
    title: "Space Debris Trajectory Prediction & Orbital Collision Avoidance Analytics Engine",
    category: "software",
    organization: "ISRO",
    theme: "Space Tech & Analytics",
  },
  {
    id: "SIH1304",
    title: "Low-Cost Ground Station Antenna Rotator Controller for SmallSat Communication",
    category: "hardware",
    organization: "ISRO / In-SPACe",
    theme: "Space Hardware",
  },
  {
    id: "SIH1421",
    title: "AI Urban Heat Island Identification from Bhuvan Satellite Thermal Sensors",
    category: "software",
    organization: "ISRO / NRSC",
    theme: "Space Tech & Environment",
  },
  {
    id: "SIH1422",
    title: "CubeSat Telemetry & Solar Array Power Conditioning Module",
    category: "hardware",
    organization: "ISRO / In-SPACe",
    theme: "Satellite Hardware",
  },

  // ==========================================
  // 7. Ministry of Jal Shakti (Water Resources)
  // ==========================================
  {
    id: "SIH1305",
    title: "IoT Sensor Network for Real-time Water Quality Index (WQI) Monitoring in Rivers",
    category: "hardware",
    organization: "Ministry of Jal Shakti",
    theme: "Clean Water & Environment",
  },
  {
    id: "SIH1306",
    title: "AI Groundwater Table Depletion Forecaster and Recharge Well Location Identifier",
    category: "software",
    organization: "Central Ground Water Board",
    theme: "Geospatial & Water",
  },
  {
    id: "SIH1307",
    title: "Automated Smart Pipeline Leakage Detection using Acoustic Sensor Fusion",
    category: "hardware",
    organization: "Jal Jeevan Mission",
    theme: "Smart Infrastructure",
  },
  {
    id: "SIH1379",
    title: "Portable Water Turbidity and Microbial Contamination Field Kit",
    category: "hardware",
    organization: "Jal Jeevan Mission",
    theme: "Water Health",
  },
  {
    id: "SIH1348",
    title: "Automated Dam Water Discharge Decision Support System during Cloudbursts",
    category: "software",
    organization: "Central Water Commission",
    theme: "Disaster Management",
  },
  {
    id: "SIH1423",
    title: "Smart Village Tank Water Volume Estimation using Satellite Radar (SAR) Feeds",
    category: "software",
    organization: "Ministry of Jal Shakti",
    theme: "Water Tech & Satellite",
  },

  // ==========================================
  // 8. Ministry of Environment, Forest & Climate Change
  // ==========================================
  {
    id: "SIH1308",
    title: "AI-based Forest Fire Early Detection System using Thermal Infrared Satellite Feeds",
    category: "software",
    organization: "Forest Survey of India",
    theme: "Disaster Management & AI",
  },
  {
    id: "SIH1309",
    title: "Acoustic Wildlife Poaching & Illegal Tree Felling Alert System for Reserve Forests",
    category: "hardware",
    organization: "Ministry of Environment",
    theme: "IoT & Wildlife Protection",
  },
  {
    id: "SIH1310",
    title: "Industrial Chimney Carbon Emission Compliance Auditor with Blockchain Logging",
    category: "hardware",
    organization: "Central Pollution Control Board",
    theme: "Environmental Tech",
  },
  {
    id: "SIH1350",
    title: "Smart Air Quality Index (AQI) Hyper-Local Prediction & Source Attribution Model",
    category: "software",
    organization: "State Pollution Control Board",
    theme: "Environmental AI",
  },
  {
    id: "SIH1359",
    title: "Automated Ocean Micro-Plastic Debris Counter using Optical Water Sensors",
    category: "hardware",
    organization: "Ministry of Earth Sciences",
    theme: "Environmental Tech",
  },
  {
    id: "SIH1424",
    title: "AI Mangrove Forest Cover Change Monitoring and Blue Carbon Estimation",
    category: "software",
    organization: "Ministry of Environment",
    theme: "Climate Tech",
  },

  // ==========================================
  // 9. Ministry of Power & Renewable Energy
  // ==========================================
  {
    id: "SIH1311",
    title: "Rooftop Solar Potential Estimator using LiDAR and High-Resolution Aerial Images",
    category: "software",
    organization: "Ministry of New & Renewable Energy",
    theme: "Clean Energy & Geospatial",
  },
  {
    id: "SIH1312",
    title: "Smart Micro-Grid Demand Response & Dynamic Tariff Balancing Controller",
    category: "hardware",
    organization: "Ministry of Power",
    theme: "Smart Grid & Hardware",
  },
  {
    id: "SIH1313",
    title: "EV Charging Station Queue Minimization & Energy Management Router Algorithm",
    category: "software",
    organization: "NITI Aayog / Ministry of Power",
    theme: "Electric Mobility",
  },
  {
    id: "SIH1344",
    title: "Autonomous Drone for Solar Panel Thermal Hotspot and Dust Inspection",
    category: "hardware",
    organization: "NTPC / Solar Energy Corp",
    theme: "Clean Energy & Drones",
  },
  {
    id: "SIH1349",
    title: "AI-based Electric Transformer Health Assessment and Oil Contamination Analyzer",
    category: "hardware",
    organization: "State Electricity Board",
    theme: "Power Grid",
  },
  {
    id: "SIH1362",
    title: "Smart Solar Inverter with Grid Back-Feed Prevention and Battery Protection",
    category: "hardware",
    organization: "Renewable Energy Corp",
    theme: "Clean Energy Hardware",
  },
  {
    id: "SIH1369",
    title: "Drone-based Overhead Power Line Thermal Hotspot Scanner",
    category: "hardware",
    organization: "Power Grid Corp of India",
    theme: "Power Hardware",
  },
  {
    id: "SIH1425",
    title: "AI-Based Wind Turbine Failure Prediction using Vibration Telemetry",
    category: "software",
    organization: "Ministry of New & Renewable Energy",
    theme: "Renewable Energy Analytics",
  },

  // ==========================================
  // 10. MeitY / Cyber Security / CERT-In
  // ==========================================
  {
    id: "SIH1314",
    title: "Automated Detection of Malicious Financial Phishing Apps on Third-Party Android Stores",
    category: "software",
    organization: "CERT-In / MeitY",
    theme: "Cyber Security",
  },
  {
    id: "SIH1315",
    title: "AI Deepfake Audio Detector for Prevention of Voice-Cloning Banking Fraud",
    category: "software",
    organization: "MeitY / Cyber Crime Coordination Centre",
    theme: "Cyber Security & AI",
  },
  {
    id: "SIH1316",
    title: "Automated Smart Contract Vulnerability Auditing Tool for Indian Web3 Startups",
    category: "software",
    organization: "MeitY",
    theme: "Cyber Security & Web3",
  },
  {
    id: "SIH1317",
    title: "Privacy-Preserving Federated Learning Engine for Cross-Hospital Medical Research",
    category: "software",
    organization: "MeitY",
    theme: "Data Privacy & AI",
  },
  {
    id: "SIH1366",
    title: "AI Tool for Detecting Fake News & Misinformation Spreads on Messaging Apps",
    category: "software",
    organization: "Fact Check Unit / MeitY",
    theme: "Cyber Security & AI",
  },
  {
    id: "SIH1385",
    title: "Automated AI Code Auditor for Government Web Portals Security Compliance",
    category: "software",
    organization: "NIC / MeitY",
    theme: "Cyber Security",
  },
  {
    id: "SIH1426",
    title: "AI Ransomware Trait Detection & Memory Dump Forensics Engine",
    category: "software",
    organization: "CERT-In",
    theme: "Cyber Forensics",
  },
  {
    id: "SIH1427",
    title: "Quantum-Resistant Post-Quantum Cryptography Encryption Library for IoT Nodes",
    category: "software",
    organization: "MeitY",
    theme: "Cryptography & Security",
  },

  // ==========================================
  // 11. Ministry of Home Affairs / Police & Disaster
  // ==========================================
  {
    id: "SIH1318",
    title: "AI CCTV Analytics for Missing Person Identification using Facial Recognition in Crowds",
    category: "software",
    organization: "National Crime Records Bureau (NCRB)",
    theme: "Public Safety & AI",
  },
  {
    id: "SIH1319",
    title: "Wearable SOS Panic Button for Women Safety with Offline Mesh Location Triangulation",
    category: "hardware",
    organization: "Ministry of Home Affairs",
    theme: "Public Safety & Hardware",
  },
  {
    id: "SIH1320",
    title: "Disaster Survivor Detection Drone equipped with Thermal & Ultra-Wideband Radar Sensors",
    category: "hardware",
    organization: "NDRF / Ministry of Home Affairs",
    theme: "Disaster Management & Robotics",
  },
  {
    id: "SIH1321",
    title: "NLP Cyberbullying & Hate Speech Early Warning System for Regional Indian Languages",
    category: "software",
    organization: "Indian Cyber Crime Coordination Centre",
    theme: "Cyber Safety & NLP",
  },
  {
    id: "SIH1351",
    title: "AI-driven Automatic License Plate Recognition (ALPR) for Speeding Vehicles",
    category: "software",
    organization: "State Police Department",
    theme: "Smart Mobility",
  },
  {
    id: "SIH1356",
    title: "IoT Fire Sprinkler Network with Thermal Camera Smoke Verification",
    category: "hardware",
    organization: "State Fire Services",
    theme: "Public Safety",
  },
  {
    id: "SIH1376",
    title: "AI-based Disaster Damage Assessment from Post-Flood Satellite Images",
    category: "software",
    organization: "NDMA",
    theme: "Disaster Analytics",
  },
  {
    id: "SIH1428",
    title: "AI Crowd Surge Early Warning System for Religious Congregations & Festivals",
    category: "software",
    organization: "Ministry of Home Affairs",
    theme: "Crowd Safety",
  },
  {
    id: "SIH1429",
    title: "Portable Rugged Satellite Emergency Messenger Node for First Responders",
    category: "hardware",
    organization: "NDRF",
    theme: "Disaster Hardware",
  },

  // ==========================================
  // 12. Ministry of Housing & Urban Affairs / Smart Cities
  // ==========================================
  {
    id: "SIH1324",
    title: "Smart Waste Bin Level Indicator and Dynamic Garbage Truck Route Optimization",
    category: "hardware",
    organization: "Smart Cities Mission",
    theme: "Smart Cities & IoT",
  },
  {
    id: "SIH1325",
    title: "AI Pothole & Road Surface Condition Mapping System using Vehicle Dashcams",
    category: "software",
    organization: "Ministry of Housing & Urban Affairs",
    theme: "Smart Cities & Mobility",
  },
  {
    id: "SIH1326",
    title: "Automated Building Footprint Extraction & Unapproved Construction Alert Engine",
    category: "software",
    organization: "Urban Local Bodies (ULBs)",
    theme: "Geospatial & Urban Planning",
  },
  {
    id: "SIH1354",
    title: "Smart Water Metering and Automated Valve Shut-Off for Domestic Buildings",
    category: "hardware",
    organization: "Municipal Corporation",
    theme: "Smart Home & IoT",
  },
  {
    id: "SIH1360",
    title: "AI System for Predicting Municipal Solid Waste Generation and Collection Paths",
    category: "software",
    organization: "Urban Development Dept",
    theme: "Smart Cities",
  },
  {
    id: "SIH1363",
    title: "AI Audio Analytics for Detecting Unauthorized Vehicle Honking in Silence Zones",
    category: "software",
    organization: "Pollution Control Board",
    theme: "Smart Cities",
  },
  {
    id: "SIH1367",
    title: "Smart Streetlight Grid with Motion Detection and Auto-Dimming Energy Saver",
    category: "hardware",
    organization: "Smart Cities Mission",
    theme: "Clean Infrastructure",
  },
  {
    id: "SIH1378",
    title: "AI Chatbot for Citizen Grievance Redressal and Auto-Routing to Municipal Ward",
    category: "software",
    organization: "Municipal Administration",
    theme: "GovTech",
  },
  {
    id: "SIH1430",
    title: "Smart Multi-Level Parking Slot Availability and Reservation Beacon System",
    category: "hardware",
    organization: "Smart Cities Mission",
    theme: "Urban Mobility",
  },
  {
    id: "SIH1431",
    title: "AI Sewer Gas Leakage & Toxic Atmosphere Detection Crawler Robot",
    category: "hardware",
    organization: "Municipal Corporation",
    theme: "Urban Sanitation Robotics",
  },

  // ==========================================
  // 13. Ministry of Rural Development & Tribal Affairs
  // ==========================================
  {
    id: "SIH1322",
    title: "GIS Asset Mapping & GEO-MGNREGA Work Site Verification Tool with Geo-Fencing",
    category: "software",
    organization: "Ministry of Rural Development",
    theme: "Rural Dev & Geospatial",
  },
  {
    id: "SIH1323",
    title: "Solar-Powered Decentralized Cold Storage Pod for Smallholder Village Farmers",
    category: "hardware",
    organization: "Ministry of Rural Development",
    theme: "Rural Hardware",
  },
  {
    id: "SIH1432",
    title: "Digital E-Commerce Platform for Tribal Handicrafts & Geographical Indication (GI) Products",
    category: "software",
    organization: "TRIFED / Ministry of Tribal Affairs",
    theme: "Rural E-Commerce",
  },
  {
    id: "SIH1433",
    title: "Solar Off-Grid Vernacular Digital Literacy Kiosk for Remote Tribal Villages",
    category: "hardware",
    organization: "Ministry of Tribal Affairs",
    theme: "Rural Hardware",
  },

  // ==========================================
  // 14. Ministry of Women & Child Development
  // ==========================================
  {
    id: "SIH1327",
    title: "Anganwadi Malnutrition Tracking and Growth Monitoring AI Image Analyzer",
    category: "software",
    organization: "Ministry of Women & Child Development",
    theme: "Health & Child Welfare",
  },
  {
    id: "SIH1328",
    title: "Automated Child Helpline Call Triage and Emergency Responder Dispatch Engine",
    category: "software",
    organization: "Childline India",
    theme: "Public Safety & Voice AI",
  },
  {
    id: "SIH1434",
    title: "AI Scanner for Instant Nutritional Deficit Detection from Child Nail and Eye Images",
    category: "software",
    organization: "POSHAN Abhiyaan",
    theme: "Child Health AI",
  },

  // ==========================================
  // 15. Ministry of Tourism & Culture
  // ==========================================
  {
    id: "SIH1329",
    title: "AR 3D Historical Monument Reconstruction App for Heritage Tourism Sites",
    category: "software",
    organization: "Archaeological Survey of India (ASI)",
    theme: "Heritage & AR/VR",
  },
  {
    id: "SIH1330",
    title: "AI Multilingual Audio Tour Guide & Monument Artifact Recognition App",
    category: "software",
    organization: "Ministry of Tourism",
    theme: "Tourism & AI",
  },
  {
    id: "SIH1435",
    title: "AI Tourist Safety Footprint Tracker with Panic Alert Geofencing for Trekking Routes",
    category: "software",
    organization: "Ministry of Tourism",
    theme: "Tourist Safety",
  },

  // ==========================================
  // 16. NHAI / Ministry of Road Transport & Highways
  // ==========================================
  {
    id: "SIH1331",
    title: "Automatic FASTag Anomaly & Toll Fraud Detection System using License Plate Recognition",
    category: "software",
    organization: "NHAI",
    theme: "Smart Mobility",
  },
  {
    id: "SIH1332",
    title: "IoT Smart Wildlife Underpass Light & Sound Deterrent System for Highways",
    category: "hardware",
    organization: "NHAI / Ministry of Road Transport",
    theme: "Highway Infrastructure",
  },
  {
    id: "SIH1347",
    title: "Wearable Fatigue and Drowsiness Detection Band for Heavy Vehicle Night Drivers",
    category: "hardware",
    organization: "Ministry of Road Transport",
    theme: "Road Safety",
  },
  {
    id: "SIH1358",
    title: "Smart Helmet with Alcohol Sensing & Accident Impact SOS Transmitter",
    category: "hardware",
    organization: "Road Safety Council",
    theme: "Hardware Safety",
  },
  {
    id: "SIH1436",
    title: "Highway Blackspot Predictor using Crash Data & Road Curvature AI Analysis",
    category: "software",
    organization: "MoRTH",
    theme: "Road Safety Analytics",
  },

  // ==========================================
  // 17. Ministry of Mines & Coal
  // ==========================================
  {
    id: "SIH1333",
    title: "Subsurface Slope Stability Monitoring & Landslide Prediction Sensor Node",
    category: "hardware",
    organization: "Coal India Limited",
    theme: "Mining Safety & Hardware",
  },
  {
    id: "SIH1334",
    title: "Automated Coal Quality Coal Ash Content Estimation using Hyper-Spectral Imaging",
    category: "software",
    organization: "Ministry of Mines",
    theme: "Mining & Computer Vision",
  },
  {
    id: "SIH1437",
    title: "Underground Miner Location Triangulation Badge using Low-Frequency RF",
    category: "hardware",
    organization: "Coal India Limited",
    theme: "Mine Safety Hardware",
  },

  // ==========================================
  // 18. Indian Coast Guard / Ports & Shipping
  // ==========================================
  {
    id: "SIH1335",
    title: "Real-Time Fishermen Vessel Boundary Crossing Alert & SOS Mesh Communicator",
    category: "hardware",
    organization: "Indian Coast Guard",
    theme: "Maritime Safety",
  },
  {
    id: "SIH1336",
    title: "AI-based Coastal Oil Spill Mapping and Drift Trajectory Prediction Tool",
    category: "software",
    organization: "Indian Coast Guard",
    theme: "Maritime Environment",
  },
  {
    id: "SIH1438",
    title: "Automated Container Damage Inspection Camera Rig for Major Seaports",
    category: "hardware",
    organization: "Ministry of Ports, Shipping & Waterways",
    theme: "Maritime Logistics",
  },

  // ==========================================
  // 19. FinTech / Banking / FIU-IND / RBI
  // ==========================================
  {
    id: "SIH1337",
    title: "Graph Neural Network for Mule Account Detection & Money Laundering Pattern Discovery",
    category: "software",
    organization: "FIU-IND / RBI",
    theme: "FinTech & Graph AI",
  },
  {
    id: "SIH1338",
    title: "Real-time UPI Fraud Prevention Shield using Behavioral Biometrics",
    category: "software",
    organization: "NPCI / Ministry of Finance",
    theme: "FinTech & Cyber Security",
  },
  {
    id: "SIH1357",
    title: "Voice-Based Vernacular Banking Assistant for Visually Impaired Elders",
    category: "software",
    organization: "State Bank / Financial Inclusion",
    theme: "FinTech & Accessibility",
  },
  {
    id: "SIH1373",
    title: "AI Tool for Detecting Fake Product Reviews and Manipulation Patterns on E-Commerce",
    category: "software",
    organization: "Department of Consumer Affairs",
    theme: "Consumer Tech & AI",
  },
  {
    id: "SIH1439",
    title: "AI-Driven Automated Invoice Fraud & GST Input Tax Credit Mismatch Detector",
    category: "software",
    organization: "GST Network (GSTN)",
    theme: "FinTech & Tax Analytics",
  },

  // ==========================================
  // 20. India Post & Telecommunications
  // ==========================================
  {
    id: "SIH1339",
    title: "AI Vernacular Address Parsing and GEO-Coding Standardization System for India Post",
    category: "software",
    organization: "India Post / Department of Posts",
    theme: "Logistics & NLP",
  },
  {
    id: "SIH1340",
    title: "Solar-Powered Outdoor Mobile Tower Battery Health Prognostics Hardware Unit",
    category: "hardware",
    organization: "Department of Telecommunications (DoT)",
    theme: "Telecom Hardware",
  },
  {
    id: "SIH1371",
    title: "AI System for Predicting Bus Arrival Times using GPS Fleet Stream",
    category: "software",
    organization: "State Road Transport Corp",
    theme: "Smart Transit",
  },
  {
    id: "SIH1440",
    title: "Automated Postal Parcel Weight & Dimension Laser Scanner Unit",
    category: "hardware",
    organization: "India Post",
    theme: "Logistics Hardware",
  },

  // ==========================================
  // 21. Additional High-Signal SIH 2026 Problem Statements
  // ==========================================
  {
    id: "SIH1342",
    title: "IoT Portable Milk Adulteration Detector for Rural Dairy Cooperatives",
    category: "hardware",
    organization: "National Dairy Development Board",
    theme: "Food Safety & IoT",
  },
  {
    id: "SIH1343",
    title: "AI-Powered Vernacular Sign Language Translator for Deaf and Mute Citizens",
    category: "software",
    organization: "Ministry of Social Justice",
    theme: "Accessibility & AI",
  },
  {
    id: "SIH1345",
    title: "Blockchain Land Registry Record Management & Fraudulent Sale Prevention System",
    category: "software",
    organization: "State Revenue Department",
    theme: "GovTech & Blockchain",
  },
  {
    id: "SIH1346",
    title: "Smart Traffic Light Timer Adjustment Engine based on Real-Time Camera Feeds",
    category: "software",
    organization: "Traffic Police Department",
    theme: "Smart Mobility",
  },
  {
    id: "SIH1361",
    title: "Blockchain-based Electronic Voting System for College Student Union Elections",
    category: "software",
    organization: "Election Commission / Universities",
    theme: "GovTech & Web3",
  },
  {
    id: "SIH1370",
    title: "Automated Ration Shop Biometric Inventory & OTP Theft Prevention Kiosk",
    category: "hardware",
    organization: "Department of Food & Public Distribution",
    theme: "GovTech Hardware",
  },
  {
    id: "SIH1374",
    title: "Smart Gas Leakage Sensor with Automatic Solenoid Valve Shutoff for Kitchens",
    category: "hardware",
    organization: "LPG Safety Association",
    theme: "Home Safety",
  },
  {
    id: "SIH1377",
    title: "Smart Solar Water Pump Controller with SMS Weather Advisory",
    category: "hardware",
    organization: "PM-KUSUM Scheme",
    theme: "Agri-Energy",
  },
  {
    id: "SIH1441",
    title: "AI Grain Spoilage & Fungal Mold Detection in Food Storage Warehouses",
    category: "software",
    organization: "Food Corporation of India",
    theme: "Agri Storage AI",
  },
  {
    id: "SIH1442",
    title: "Low-Cost Smart Braille Refreshable Display Reader for Vernacular Books",
    category: "hardware",
    organization: "Ministry of Social Justice",
    theme: "Accessibility Tech",
  },
  {
    id: "SIH1443",
    title: "AI-Driven Automated Landslide Susceptibility Mapping in Himalayan Corridors",
    category: "software",
    organization: "Geological Survey of India",
    theme: "Geospatial AI",
  },
  {
    id: "SIH1444",
    title: "Smart Aquaculture Water Salinity & Oxygenation Automated Aerator System",
    category: "hardware",
    organization: "Department of Fisheries",
    theme: "Aquaculture IoT",
  },
  {
    id: "SIH1445",
    title: "AI-Based Audio Analysis for Early Failure Diagnosis of Industrial Compressors",
    category: "software",
    organization: "Ministry of Heavy Industries",
    theme: "Smart Manufacturing",
  },
  {
    id: "SIH1446",
    title: "Blockchain-based Handloom & Handicraft Authenticity Certificate Verification",
    category: "software",
    organization: "Ministry of Textiles",
    theme: "Textiles & Web3",
  },
  {
    id: "SIH1447",
    title: "Automated Pothole Repair Material Volume Estimator using Mobile LiDAR",
    category: "software",
    organization: "MoRTH",
    theme: "Smart Mobility",
  },
  {
    id: "SIH1448",
    title: "Portable Solar-Powered Water Purification Straw for Flood Disaster Relief",
    category: "hardware",
    organization: "NDRF",
    theme: "Disaster Relief Hardware",
  },
  {
    id: "SIH1449",
    title: "AI Speech Therapy Assistant with Gamified Pronunciation Evaluation for Children",
    category: "software",
    organization: "AIISH Mysuru",
    theme: "EdTech & Speech AI",
  },
  {
    id: "SIH1450",
    title: "Smart Cold Storage Box for Organ Transplantation Transport with GPS Telemetry",
    category: "hardware",
    organization: "NOTTO / Ministry of Health",
    theme: "MedTech Logistics",
  },
];

// Backwards compatibility export
export const TOP_100_SIH_PROBLEM_STATEMENTS = SIH_PROBLEM_STATEMENTS;
