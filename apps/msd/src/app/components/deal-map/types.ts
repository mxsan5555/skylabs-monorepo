/** One location on the map. `label` is the marker text (price), `title` names it for screen
 *  readers. Without `href` the marker is plain text (the deal page's single-branch map). */
export interface DealMapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  href?: string;
}
