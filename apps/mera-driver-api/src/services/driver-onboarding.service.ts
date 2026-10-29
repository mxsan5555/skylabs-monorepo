import { UpdateOwnDriverSchema } from '../schemas/driverSelf.schema';
import { DRIVER_PILLS } from './driver-pill.service';
import { getDriverById, updateDriver } from './driver.service';
import { HttpError } from '../middleware/errorHandler';

export async function saveOwnPill(driverId: string, input: { tab: number; pill: number; complete: boolean; fields: Record<string, unknown> }) {
  const pill = DRIVER_PILLS.find(p => p.tab === input.tab && p.pill === input.pill);
  if (!pill || pill.financeOnly) throw new HttpError(422, 'PILL_READ_ONLY', 'This pill requires finance/admin review');
  const allowed = UpdateOwnDriverSchema.strict().safeParse(input.fields);
  if (!allowed.success || Object.keys(input.fields).some(key => !pill.fields.includes(key))) {
    throw new HttpError(422, 'PILL_FIELDS_INVALID', 'Only editable fields from this pill may be saved');
  }
  const existing = await getDriverById(driverId);
  const saved = { ...existing, ...allowed.data } as Record<string, unknown>;
  if (input.complete) {
    const required = input.tab === 1 && input.pill === 0 ? ['firstName', 'gender']
      : input.tab === 1 && input.pill === 1 ? ['email', 'phone']
      : input.tab === 1 && input.pill === 3 ? ['driverType', 'avatar']
      : input.tab === 3 && input.pill === 0 ? ['dlNo'] : [];
    if (required.some(key => typeof saved[key] !== 'string' || !(saved[key] as string).trim())) {
      throw new HttpError(422, 'PILL_INCOMPLETE', `Complete required fields: ${required.join(', ')}`);
    }
    if (input.tab === 1 && input.pill === 1 && !/^\d{10}$/.test(String(saved.phone))) {
      throw new HttpError(422, 'PHONE_INVALID', 'Phone must contain 10 digits');
    }
  }
  return updateDriver(driverId, { ...allowed.data, ...(input.complete ? { stepCompleted: input.tab, subStepCompleted: input.pill } : {}) });
}
