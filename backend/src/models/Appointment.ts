import mongoose, { type InferSchemaType } from 'mongoose';

export const APPOINTMENT_MODES = ['phone', 'video', 'office'] as const;
export const APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'reschedule_requested', 'cancelled', 'completed', 'no_show'] as const;
// Statuses in which the appointment still occupies the counsellor's time.
export const ACTIVE_APPOINTMENT: Array<(typeof APPOINTMENT_STATUSES)[number]> = ['scheduled', 'confirmed', 'reschedule_requested'];

// A counselling session scheduled by a counsellor for an enquiry. Times are stored in UTC.
const appointmentSchema = new mongoose.Schema(
  {
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    counsellor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 180 },
    mode: { type: String, enum: APPOINTMENT_MODES, required: true },
    // Student-visible: a meeting link (https) or an address/phone instructions.
    meetingDetails: { type: String, trim: true, maxlength: 500, default: '' },
    agenda: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'scheduled', required: true },
    // From the student (reschedule request or cancellation reason).
    studentNote: { type: String, trim: true, maxlength: 500, default: '' },
    // Internal.
    outcomeNote: { type: String, trim: true, maxlength: 2000, default: '' },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);
appointmentSchema.index({ counsellor: 1, startsAt: 1 }, { name: 'appointment_by_counsellor' });
appointmentSchema.index({ student: 1, startsAt: -1 }, { name: 'appointment_by_student' });
appointmentSchema.index({ enquiry: 1 }, { name: 'appointment_by_enquiry' });
appointmentSchema.index({ status: 1, startsAt: 1 }, { name: 'appointment_by_status' });

export type Appointment = InferSchemaType<typeof appointmentSchema>;
export const AppointmentModel = mongoose.model('Appointment', appointmentSchema, 'counsellingAppointments');
