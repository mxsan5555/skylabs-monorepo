/**
 * Static Indian States/UTs → major cities dataset. Used anywhere a vendor or customer needs a
 * cascading State → City picker (e.g. Branch creation, the public Explore location filter) —
 * there is no `State`/`City` entity in the backend (a vendor's/branch's "state" is just the
 * distinct `Branch.state` string value grouped client-side, see the direct-category-access
 * plan's architecture notes), so this is intentionally a plain static list, not an API call.
 *
 * Not exhaustive down to every town — covers all states/UTs plus their most-searched cities,
 * enough to drive a real dropdown without fabricating precision the backend can't back up.
 */
export interface IndiaState {
  state: string;
  cities: string[];
}

export const INDIA_LOCATIONS: IndiaState[] = [
  { state: 'Andhra Pradesh', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati'] },
  { state: 'Arunachal Pradesh', cities: ['Itanagar', 'Naharlagun'] },
  { state: 'Assam', cities: ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat'] },
  { state: 'Bihar', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur'] },
  { state: 'Chhattisgarh', cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Durg'] },
  { state: 'Goa', cities: ['Panaji', 'Margao', 'Vasco da Gama'] },
  { state: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar'] },
  { state: 'Haryana', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal'] },
  { state: 'Himachal Pradesh', cities: ['Shimla', 'Manali', 'Dharamshala'] },
  { state: 'Jharkhand', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'] },
  { state: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi'] },
  { state: 'Kerala', cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur'] },
  { state: 'Madhya Pradesh', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'] },
  { state: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad'] },
  { state: 'Manipur', cities: ['Imphal'] },
  { state: 'Meghalaya', cities: ['Shillong'] },
  { state: 'Mizoram', cities: ['Aizawl'] },
  { state: 'Nagaland', cities: ['Kohima', 'Dimapur'] },
  { state: 'Odisha', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri'] },
  { state: 'Punjab', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Chandigarh', 'Patiala'] },
  { state: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'] },
  { state: 'Sikkim', cities: ['Gangtok'] },
  { state: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'] },
  { state: 'Telangana', cities: ['Hyderabad', 'Warangal', 'Nizamabad'] },
  { state: 'Tripura', cities: ['Agartala'] },
  { state: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Agra', 'Varanasi'] },
  { state: 'Uttarakhand', cities: ['Dehradun', 'Haridwar', 'Rishikesh', 'Nainital'] },
  { state: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri'] },
  { state: 'Andaman and Nicobar Islands', cities: ['Port Blair'] },
  { state: 'Chandigarh', cities: ['Chandigarh'] },
  { state: 'Dadra and Nagar Haveli and Daman and Diu', cities: ['Daman', 'Silvassa'] },
  { state: 'Delhi', cities: ['New Delhi', 'Dwarka', 'Rohini', 'Saket'] },
  { state: 'Jammu and Kashmir', cities: ['Srinagar', 'Jammu'] },
  { state: 'Ladakh', cities: ['Leh', 'Kargil'] },
  { state: 'Lakshadweep', cities: ['Kavaratti'] },
  { state: 'Puducherry', cities: ['Puducherry', 'Karaikal'] },
];

export const STATES: string[] = INDIA_LOCATIONS.map((s) => s.state);

export function citiesForState(state: string): string[] {
  return INDIA_LOCATIONS.find((s) => s.state === state)?.cities ?? [];
}
