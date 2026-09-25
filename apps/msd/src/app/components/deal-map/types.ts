/** One deal location on the map. `label` is the marker text (price), `title` names it for screen readers. */
export interface DealMapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  href: string;
}
