import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RegistryIdentity } from './registry-identity';
describe('Registry text identity',()=>{
 it('preserves name and phone lines without adding avatars, images or IDs',()=>{
  const host=document.createElement('div') as any;let controller:any;host.addController=(value:any)=>controller=value;host.removeController=vi.fn();host.requestUpdate=vi.fn();host.attachShadow({mode:'open'}).innerHTML='<table><tbody><tr><td data-label="Driver">Ravi Kumar\n9876543210</td><td data-label="City">Pune</td></tr></tbody></table>';
  TestBed.configureTestingModule({providers:[{provide:ElementRef,useValue:new ElementRef(host)}]});const directive=TestBed.runInInjectionContext(()=>new RegistryIdentity());controller.hostUpdated();const cell=host.shadowRoot.querySelector('td');expect(cell.textContent).toBe('Ravi Kumar\n9876543210');expect(cell.style.whiteSpace).toBe('pre-line');expect(cell.querySelector('img')).toBeNull();directive.ngOnDestroy();expect(host.removeController).toHaveBeenCalledWith(controller);TestBed.resetTestingModule();
 });
});
