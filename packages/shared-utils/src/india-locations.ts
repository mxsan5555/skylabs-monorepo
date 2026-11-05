/**
 * Indian states and union territories with their most-searched cities. The one location list for
 * msd: the branch form's State -> City picker, the storefront location filters and the msd-api
 * allowlist that keeps `Branch.state` / `Branch.city` in step with them (docs/msd/PLANNING.md
 * §2.7, C-03). Not every town: enough to drive a real dropdown.
 */
export interface IndiaState {
  state: string;
  cities: string[];
}

export const INDIA_LOCATIONS: IndiaState[] = [
  { "state": "Andhra Pradesh", "cities": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Tirupati", "Kurnool", "Kakinada", "Rajahmundry", "Kadapa", "Anantapur", "Eluru", "Vizianagaram"] },
  { "state": "Arunachal Pradesh", "cities": ["Itanagar", "Naharlagun", "Tawang", "Pasighat", "Ziro", "Bomdila", "Namsai"] },
  { "state": "Assam", "cities": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur", "Tinsukia", "Nagaon", "Bongaigaon", "Diphu"] },
  { "state": "Bihar", "cities": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Purnia", "Darbhanga", "Bihar Sharif", "Ara", "Begusarai", "Katihar", "Munger", "Chhapra","Raxaul"] },
  { "state": "Chhattisgarh", "cities": ["Raipur", "Bhilai", "Bilaspur", "Durg", "Korba", "Raigarh", "Jagdalpur", "Ambikapur", "Rajnandgaon"] },
  { "state": "Goa", "cities": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda", "Bicholim"] },
  { "state": "Gujarat", "cities": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar", "Bhavnagar", "Jamnagar", "Junagadh", "Anand", "Navsari", "Morbi", "Bharuch", "Vapi"] },
  { "state": "Haryana", "cities": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal", "Hisar", "Rohtak", "Sonipat", "Panchkula", "Yamunanagar", "Kurukshetra", "Jind"] },
  { "state": "Himachal Pradesh", "cities": ["Shimla", "Manali", "Dharamshala", "Solan", "Mandi", "Kullu", "Bilaspur", "Chamba", "Hamirpur", "Nahan"] },
  { "state": "Jharkhand", "cities": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh", "Deoghar", "Giridih", "Ramgarh", "Medininagar", "Phusro"] },
  { "state": "Karnataka", "cities": ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Kalaburagi", "Davanagere", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Udupi"] },
  { "state": "Kerala", "cities": ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam", "Alappuzha", "Palakkad", "Kannur", "Kottayam", "Malappuram", "Thalassery"] },
  { "state": "Madhya Pradesh", "cities": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna", "Ratlam", "Rewa", "Singrauli", "Burhanpur", "Khandwa", "Morena"] },
  { "state": "Maharashtra", "cities": ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Aurangabad", "Solapur", "Amravati", "Kolhapur", "Nanded", "Sangli", "Jalgaon", "Akola", "Latur", "Dhule", "Ahmednagar", "Chandrapur"] },
  { "state": "Manipur", "cities": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur", "Kakching", "Senapati"] },
  { "state": "Meghalaya", "cities": ["Shillong", "Tura", "Jowai", "Nongpoh", "Baghmara"] },
  { "state": "Mizoram", "cities": ["Aizawl", "Lunglei", "Champhai", "Saiha", "Kolasib", "Serchhip"] },
  { "state": "Nagaland", "cities": ["Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha", "Zunheboto"] },
  { "state": "Odisha", "cities": ["Bhubaneswar", "Cuttack", "Rourkela", "Puri", "Sambalpur", "Berhampur", "Balasore", "Bhadrak", "Baripada", "Jharsuguda"] },
  { "state": "Punjab", "cities": ["Ludhiana", "Amritsar", "Jalandhar", "Chandigarh", "Patiala", "Bathinda", "Hoshiarpur", "Mohali", "Pathankot", "Moga", "Batala", "Abohar"] },
  { "state": "Rajasthan", "cities": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Bhilwara", "Sikar", "Pali", "Bharatpur", "Sri Ganganagar", "Barmer"] },
  { "state": "Sikkim", "cities": ["Gangtok", "Namchi", "Gyalshing", "Mangan", "Jorethang"] },
  { "state": "Tamil Nadu", "cities": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Erode", "Tirunelveli", "Vellore", "Thanjavur", "Thoothukudi", "Dindigul", "Cuddalore", "Kanchipuram"] },
  { "state": "Telangana", "cities": ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar", "Ramagundam", "Mahbubnagar", "Nalgonda", "Adilabad", "Siddipet"] },
  { "state": "Tripura", "cities": ["Agartala", "Udaipur", "Dharmanagar", "Kailashahar", "Ambassa"] },
  { "state": "Uttar Pradesh", "cities": ["Ayodhya","Lucknow", "Kanpur", "Noida", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Prayagraj", "Bareilly", "Aligarh", "Moradabad", "Saharanpur", "Gorakhpur", "Jhansi", "Mathura", "Rampur", "Shahjahanpur", "Firozabad", "Muzaffarnagar", "Greater Noida"] },
  { "state": "Uttarakhand", "cities": ["Dehradun", "Haridwar", "Rishikesh", "Nainital", "Haldwani", "Roorkee", "Rudrapur", "Almora", "Pithoragarh", "Mussoorie"] },
  { "state": "West Bengal", "cities": ["Kolkata", "Howrah", "Durgapur", "Siliguri", "Asansol", "Bardhaman", "Kharagpur", "Haldia", "Malda", "Krishnanagar", "Berhampore", "Jalpaiguri"] },
  { "state": "Andaman and Nicobar Islands", "cities": ["Port Blair", "Car Nicobar", "Diglipur", "Mayabunder"] },
  { "state": "Chandigarh", "cities": ["Chandigarh"] },
  { "state": "Dadra and Nagar Haveli and Daman and Diu", "cities": ["Daman", "Diu", "Silvassa"] },
  { "state": "Delhi", "cities": ["New Delhi", "Delhi", "Dwarka", "Rohini", "Saket", "Connaught Place", "Karol Bagh", "Vasant Kunj", "Pitampura", "Lajpat Nagar"] },
  { "state": "Jammu and Kashmir", "cities": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Kathua", "Udhampur", "Poonch", "Rajouri"] },
  { "state": "Ladakh", "cities": ["Leh", "Kargil", "Diskit", "Dras"] },
  { "state": "Lakshadweep", "cities": ["Kavaratti", "Minicoy", "Agatti", "Andrott"] },
  { "state": "Puducherry", "cities": ["Puducherry", "Karaikal", "Mahe", "Yanam"] }
];

export const STATES: string[] = INDIA_LOCATIONS.map((s) => s.state);

export function citiesForState(state: string): string[] {
  return INDIA_LOCATIONS.find((s) => s.state === state)?.cities ?? [];
}

/** True when `city` is one of `state`'s cities (exact, case-sensitive match). */
export function isIndiaLocation(state: string, city: string): boolean {
  return citiesForState(state).includes(city);
}
