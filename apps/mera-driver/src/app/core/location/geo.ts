export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CatalogCity {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  aliases?: string[];
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Calculates Haversine distance in kilometers between two geographic points. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Predefined comprehensive catalog of major Indian cities across all zones. */
export const INDIAN_CITIES: CatalogCity[] = [
  // Karnataka
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9716,
    lng: 77.5946,
    aliases: ['bangalore', 'bengaluru urban', 'bengaluru rural', 'blore'],
  },
  { id: 'mysuru', name: 'Mysuru', state: 'Karnataka', lat: 12.2958, lng: 76.6394, aliases: ['mysore'] },
  { id: 'mangaluru', name: 'Mangaluru', state: 'Karnataka', lat: 12.9141, lng: 74.856, aliases: ['mangalore'] },
  { id: 'hubballi', name: 'Hubballi', state: 'Karnataka', lat: 15.3647, lng: 75.124, aliases: ['hubli', 'hubballi dharwad'] },

  // Delhi NCR, Haryana & Punjab
  {
    id: 'delhi',
    name: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.6139,
    lng: 77.209,
    aliases: ['delhi', 'new delhi', 'south delhi', 'north delhi', 'west delhi', 'east delhi', 'central delhi'],
  },
  { id: 'gurugram', name: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266, aliases: ['gurgaon'] },
  { id: 'faridabad', name: 'Faridabad', state: 'Haryana', lat: 28.4089, lng: 77.3178 },
  { id: 'chandigarh', name: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { id: 'mohali', name: 'Mohali', state: 'Punjab', lat: 30.7046, lng: 76.7179, aliases: ['sas nagar', 'sahibzada ajit singh nagar'] },
  { id: 'panchkula', name: 'Panchkula', state: 'Haryana', lat: 30.6942, lng: 76.8606 },
  { id: 'ludhiana', name: 'Ludhiana', state: 'Punjab', lat: 30.901, lng: 75.8573 },
  { id: 'amritsar', name: 'Amritsar', state: 'Punjab', lat: 31.634, lng: 74.8723 },

  // Uttar Pradesh
  { id: 'noida', name: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.391, aliases: ['gautam buddha nagar'] },
  { id: 'greater-noida', name: 'Greater Noida', state: 'Uttar Pradesh', lat: 28.4744, lng: 77.504, aliases: ['greater noida west', 'gr noida'] },
  { id: 'ghaziabad', name: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538, aliases: ['gaziabad'] },
  { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
  { id: 'kanpur', name: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319 },
  { id: 'agra', name: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081 },
  { id: 'varanasi', name: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739, aliases: ['banaras', 'kashi'] },
  { id: 'prayagraj', name: 'Prayagraj', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463, aliases: ['allahabad'] },
  { id: 'meerut', name: 'Meerut', state: 'Uttar Pradesh', lat: 28.9845, lng: 77.7064 },
  { id: 'bareilly', name: 'Bareilly', state: 'Uttar Pradesh', lat: 28.367, lng: 79.4304 },
  { id: 'ayodhya', name: 'Ayodhya', state: 'Uttar Pradesh', lat: 26.7922, lng: 82.1998, aliases: ['faizabad'] },

  // Maharashtra
  {
    id: 'mumbai',
    name: 'Mumbai',
    state: 'Maharashtra',
    lat: 19.076,
    lng: 72.8777,
    aliases: ['bombay', 'mumbai city', 'mumbai suburban'],
  },
  { id: 'navi-mumbai', name: 'Navi Mumbai', state: 'Maharashtra', lat: 19.033, lng: 73.0297, aliases: ['new bombay', 'vashi', 'nerul', 'kharghar', 'belapur', 'panvel'] },
  { id: 'thane', name: 'Thane', state: 'Maharashtra', lat: 19.2183, lng: 72.9781 },
  { id: 'kalyan', name: 'Kalyan-Dombivli', state: 'Maharashtra', lat: 19.2403, lng: 73.1305, aliases: ['kalyan', 'dombivli'] },
  { id: 'pune', name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, aliases: ['poona', 'pimpri chinchwad', 'pcmc'] },
  { id: 'nagpur', name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882 },
  { id: 'nashik', name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898, aliases: ['nasik'] },
  { id: 'aurangabad', name: 'Chhatrapati Sambhajinagar', state: 'Maharashtra', lat: 19.8762, lng: 75.3433, aliases: ['aurangabad'] },

  // Madhya Pradesh
  { id: 'indore', name: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577 },
  { id: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126 },
  { id: 'jabalpur', name: 'Jabalpur', state: 'Madhya Pradesh', lat: 23.1815, lng: 79.9864 },
  { id: 'gwalior', name: 'Gwalior', state: 'Madhya Pradesh', lat: 26.2183, lng: 78.1828 },
  { id: 'ujjain', name: 'Ujjain', state: 'Madhya Pradesh', lat: 23.1765, lng: 75.7885 },

  // Gujarat
  { id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, aliases: ['amdavad'] },
  { id: 'gandhinagar', name: 'Gandhinagar', state: 'Gujarat', lat: 23.2156, lng: 72.6369 },
  { id: 'surat', name: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311 },
  { id: 'vadodara', name: 'Vadodara', state: 'Gujarat', lat: 22.3072, lng: 73.1812, aliases: ['baroda'] },
  { id: 'rajkot', name: 'Rajkot', state: 'Gujarat', lat: 22.3039, lng: 70.8022 },

  // Telangana & Andhra Pradesh
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    state: 'Telangana',
    lat: 17.385,
    lng: 78.4867,
    aliases: ['secunderabad', 'cyberabad'],
  },
  { id: 'visakhapatnam', name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185, aliases: ['vizag'] },
  { id: 'vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.648 },

  // Tamil Nadu & Kerala
  {
    id: 'chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    lat: 13.0827,
    lng: 80.2707,
    aliases: ['madras'],
  },
  { id: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558 },
  { id: 'madurai', name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, aliases: ['cochin', 'ernakulam'] },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366, aliases: ['trivandrum'] },

  // West Bengal, Bihar & Jharkhand
  {
    id: 'kolkata',
    name: 'Kolkata',
    state: 'West Bengal',
    lat: 22.5726,
    lng: 88.3639,
    aliases: ['calcutta'],
  },
  { id: 'howrah', name: 'Howrah', state: 'West Bengal', lat: 22.5958, lng: 88.2636 },
  { id: 'patna', name: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376 },
  { id: 'ranchi', name: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096 },
  { id: 'jamshedpur', name: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lng: 86.2029, aliases: ['tatanagar'] },

  // Rajasthan
  { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, aliases: ['pink city'] },
  { id: 'jodhpur', name: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lng: 73.0243 },
  { id: 'udaipur', name: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125 },

  // Uttarakhand & Himachal Pradesh
  { id: 'dehradun', name: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322 },
  { id: 'haridwar', name: 'Haridwar', state: 'Uttarakhand', lat: 29.9457, lng: 78.1642 },
  { id: 'shimla', name: 'Shimla', state: 'Himachal Pradesh', lat: 31.1048, lng: 77.1734 },

  // Odisha, Chhattisgarh & Assam
  { id: 'bhubaneswar', name: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245 },
  { id: 'raipur', name: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296 },
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
];

/** Normalizes a city name by stripping diacritics/accents, special characters and spaces. */
export function normalizeCityString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Matches a raw city or locality name against the catalog with strict priority:
 * 1. Exact match on City Name or City ID (e.g. "Mumbai" === "mumbai", "Navi Mumbai" === "navi-mumbai")
 * 2. Exact match on defined Aliases (e.g. "Bombay" === "bombay", "Gurgaon" === "gurgaon")
 * 3. Exact word boundary match on full tokens (e.g. "Indiranagar, Bengaluru" ➔ matches "Bengaluru")
 *
 * Prevents false positive cross-city matches (e.g., "Navi Mumbai" won't match "Mumbai").
 */
export function matchCityByName(rawName: string, cities: CatalogCity[] = INDIAN_CITIES): CatalogCity | null {
  if (!rawName || !rawName.trim()) return null;
  const normRaw = normalizeCityString(rawName);
  if (!normRaw) return null;

  // Phase 1: Exact Name or ID match
  for (const c of cities) {
    if (normalizeCityString(c.name) === normRaw || normalizeCityString(c.id) === normRaw) {
      return c;
    }
  }

  // Phase 2: Exact Alias match
  for (const c of cities) {
    if (c.aliases && c.aliases.some((a) => normalizeCityString(a) === normRaw)) {
      return c;
    }
  }

  // Phase 3: Token-based match for formatted addresses (e.g., "Sector 62, Noida, Uttar Pradesh")
  const rawTokens = rawName
    .split(/[,;\-\/]+/)
    .map((t) => normalizeCityString(t))
    .filter((t) => t.length > 2);

  for (const token of rawTokens) {
    for (const c of cities) {
      if (normalizeCityString(c.name) === token || normalizeCityString(c.id) === token) {
        return c;
      }
      if (c.aliases && c.aliases.some((a) => normalizeCityString(a) === token)) {
        return c;
      }
    }
  }

  return null;
}

/** Finds the nearest city in the catalog to the given coordinate point. */
export function nearestCity(point: Coordinates, cities: CatalogCity[] = INDIAN_CITIES): CatalogCity {
  const list = cities && cities.length > 0 ? cities : INDIAN_CITIES;
  let best: CatalogCity = list[0] ?? INDIAN_CITIES[0];
  let bestKm = Infinity;
  for (const c of list) {
    const km = haversineKm(point, { lat: c.lat, lng: c.lng });
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
