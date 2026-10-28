// One-off Stage 3 migration (`npm run migrate:stage3`). Explicit only; safe to run more than once.
// - Grants the new `admissions.confirm` permission to administrators who can manage administrators (the owners).
//   Other admins get it only when an owner grants it.
// - Creates the indexes of the new enquiry, application and appointment collections.
import { connectDatabase, disconnectDatabase } from '../../backend/src/config/database.js';
import { env } from '../../backend/src/config/env.js';
import { AdmissionApplicationModel } from '../../backend/src/models/Admission.js';
import { AppointmentModel } from '../../backend/src/models/Appointment.js';
import { EnquiryEventModel, EnquiryModel } from '../../backend/src/models/Enquiry.js';
import { UserModel } from '../../backend/src/models/User.js';

async function main() {
  await connectDatabase(env.MONGODB_URI, { attempts: 1 });
  const granted = await UserModel.updateMany({ role: 'admin', permissions: 'admins.manage' }, { $addToSet: { permissions: 'admissions.confirm' } });
  for (const m of [EnquiryModel, EnquiryEventModel, AdmissionApplicationModel, AppointmentModel]) await m.createIndexes();
  console.error(`Stage 3 migration: admissions.confirm granted to ${granted.modifiedCount} owner admin(s); enquiry indexes created.`);
}

main()
  .catch((err: Error) => {
    console.error(`Migration failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
