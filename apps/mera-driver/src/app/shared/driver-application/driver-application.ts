import { Component, CUSTOM_ELEMENTS_SCHEMA, inject, input, output, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { httpErrorMessage } from '../../core/http-error';
@Component({selector:'md-driver-application',templateUrl:'./driver-application.html',schemas:[CUSTOM_ELEMENTS_SCHEMA]})
export class DriverApplication implements OnInit {
  readonly open=input(true); readonly closed=output<void>();
  private readonly http=inject(HttpClient);private readonly router=inject(Router);
  protected readonly options=signal<{id:string;label:string}[]>([]);
  protected readonly loading=signal(true);protected readonly saving=signal(false);
  protected readonly error=signal('');protected readonly success=signal('');
  protected readonly fields=signal<Record<string,string>>({});
  protected fullName='';protected phone='';protected driverTypeId='';
  ngOnInit(){this.http.get<{data:{id:string;label:string}[]}>(`${environment.apiUrl}/drivers/application-options`).subscribe({next:r=>{this.options.set(r.data);this.loading.set(false);if(r.data.length!==3)this.error.set('Driver Type options are incomplete. Please contact the team.');},error:async e=>{this.loading.set(false);this.error.set(await httpErrorMessage(e));}});}
  protected close(){if(this.saving())return;this.closed.emit();if(this.router.url.split('?')[0]==='/become-driver')void this.router.navigateByUrl('/');}
  protected submit(){
    if(this.saving()||this.success())return;
    const errors:Record<string,string>={};
    if(this.fullName.trim().length<2||!/[\p{L}]/u.test(this.fullName))errors['fullName']='Enter your full name.';
    const digits=this.phone.replace(/[^0-9]/g,'').replace(/^91(?=\d{10}$)/,'');
    if(!/^[6-9]\d{9}$/.test(digits))errors['phone']='Enter a valid Indian mobile number.';
    if(!this.options().some(o=>o.id===this.driverTypeId))errors['driverTypeId']='Select a Driver Type.';
    this.fields.set(errors);if(Object.keys(errors).length)return;
    this.saving.set(true);this.error.set('');
    this.http.post<{data:{message:string}}>(`${environment.apiUrl}/drivers/applications`,{fullName:this.fullName.trim(),phone:this.phone,driverTypeId:this.driverTypeId}).subscribe({next:r=>{this.saving.set(false);this.success.set(r.data.message);},error:async e=>{this.saving.set(false);this.error.set(await httpErrorMessage(e));}});
  }
}
