import { Directive, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import type { Driver } from '../../../core/drivers/drivers-api.service';
/** Keeps the existing DataTable identity cell readable without photos or internal IDs. */
@Directive({selector:'sky-data-table[registryIdentity]'})
export class RegistryIdentity implements OnChanges,OnDestroy {
 @Input() registryIdentity:Driver[]=[];
 private readonly element=inject(ElementRef<HTMLElement>).nativeElement as HTMLElement & {addController?:(controller:object)=>void;removeController?:(controller:object)=>void;requestUpdate?:()=>void};
 private destroyed=false;
 private readonly controller={hostUpdated:()=>{for(const cell of Array.from(this.element.shadowRoot?.querySelectorAll<HTMLElement>('tbody td[data-label="Driver"]')??[]))cell.style.whiteSpace='pre-line';}};
 constructor(){if(this.element.addController)this.element.addController(this.controller);else customElements.whenDefined('sky-data-table').then(()=>{if(!this.destroyed){this.element.addController?.(this.controller);this.element.requestUpdate?.();}});}
 ngOnChanges(){this.element.requestUpdate?.();}
 ngOnDestroy(){this.destroyed=true;this.element.removeController?.(this.controller);}
}
