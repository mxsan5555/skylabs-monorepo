import { Dialog, TextButton } from '@skylabs-monorepo/shared-ui/react';
import { CityPicker } from './city-picker';
import content from '../../../content.json';

const t = content.header.city;

/** City picker dialog: the shared `CityPicker` in an M3 dialog. Opened by the header `CityChip`
 *  and the filter panel. */
export function CityPickerDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose}>
      <span slot="headline">{t.dialogTitle}</span>
      <div slot="content">
        <CityPicker onDone={onClose} />
      </div>
      <div slot="actions">
        <TextButton onClick={onClose}>{t.close}</TextButton>
      </div>
    </Dialog>
  );
}
