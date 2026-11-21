import { PrismaClient, Role, MembershipStatus, MedicationCriticality, AppointmentStatus } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Default password hash for all demo users: "Password123!"
  const defaultPasswordHash = await hash('Password123!');
  // Default passcode hash for quick unlock: "1234"
  const defaultPasscodeHash = await hash('1234');
  const caregiverPasscodeHash = await hash('5678');

  // Clean existing data for clean re-seeding
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.careNote.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doseEventAction.deleteMany();
  await prisma.doseEvent.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.careProfile.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Users
  const userKamala = await prisma.user.create({
    data: {
      email: 'kamala@eldercare.demo',
      name: 'Kamala Devi',
      passwordHash: defaultPasswordHash,
      consentVersion: 'v1.0',
    },
  });

  const userRajesh = await prisma.user.create({
    data: {
      email: 'rajesh@eldercare.demo',
      name: 'Rajesh Sharma',
      passwordHash: defaultPasswordHash,
      consentVersion: 'v1.0',
    },
  });

  const userAshok = await prisma.user.create({
    data: {
      email: 'ashok@eldercare.demo',
      name: 'Col. Ashok Verma',
      passwordHash: defaultPasswordHash,
      consentVersion: 'v1.0',
    },
  });

  const userAnita = await prisma.user.create({
    data: {
      email: 'anita@eldercare.demo',
      name: 'Anita Verma',
      passwordHash: defaultPasswordHash,
      consentVersion: 'v1.0',
    },
  });

  // 2. Demo Profile 1: Kamala Devi (Pune, India)
  const profileKamala = await prisma.careProfile.create({
    data: {
      ownerId: userKamala.id,
      displayName: 'Kamala Devi',
      dateOfBirth: new Date('1952-04-14'),
      timezone: 'Asia/Kolkata',
      bloodType: 'O+',
      allergies: 'Penicillin, Sulfa drugs',
      conditions: 'Type 2 Diabetes, Hypertension, Osteoarthritis',
      primaryDoctorName: 'Dr. Anand Kulkarni',
      preferredHospital: 'Ruby Hall Clinic, Pune',
      emergencyCode: 'EMRG8821',
      emailShowsMedicineNames: false,
      readAloudEnabled: true,
    },
  });

  // Memberships for Kamala's profile
  await prisma.membership.create({
    data: {
      profileId: profileKamala.id,
      userId: userKamala.id,
      role: Role.OWNER,
      scopes: {
        view_medications: true,
        manage_medications: true,
        view_appointments: true,
        manage_appointments: true,
        view_notes: true,
        write_notes: true,
        receive_missed_dose_alerts: true,
        view_private_items: true,
      },
      status: MembershipStatus.ACTIVE,
      passcodeHash: defaultPasscodeHash,
    },
  });

  const rajeshMembership = await prisma.membership.create({
    data: {
      profileId: profileKamala.id,
      userId: userRajesh.id,
      role: Role.CAREGIVER,
      scopes: {
        view_medications: true,
        manage_medications: true,
        view_appointments: true,
        manage_appointments: true,
        view_notes: true,
        write_notes: true,
        receive_missed_dose_alerts: true,
        view_private_items: false, // Restricted by default
      },
      status: MembershipStatus.ACTIVE,
      passcodeHash: caregiverPasscodeHash,
    },
  });

  // Medications & Schedules for Kamala
  const medMetformin = await prisma.medication.create({
    data: {
      profileId: profileKamala.id,
      name: 'Metformin',
      genericName: 'Metformin Hydrochloride',
      strength: '500 mg',
      form: 'Tablet',
      instructions: 'Take with or immediately after meals',
      criticality: MedicationCriticality.STANDARD,
      prescribedBy: 'Dr. Anand Kulkarni',
      startDate: new Date('2026-01-01'),
      stockCount: 45,
      refillThreshold: 10,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      medicationId: medMetformin.id,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00', '20:00'],
      startsOn: new Date('2026-01-01'),
      graceMinutes: 60,
      snoozeMinutes: 15,
      escalateToCaregivers: false,
    },
  });

  const medTelmisartan = await prisma.medication.create({
    data: {
      profileId: profileKamala.id,
      name: 'Telmisartan',
      genericName: 'Telmisartan',
      strength: '40 mg',
      form: 'Tablet',
      instructions: 'Take in the morning with a full glass of water',
      criticality: MedicationCriticality.CRITICAL,
      prescribedBy: 'Dr. Anand Kulkarni',
      startDate: new Date('2026-01-01'),
      stockCount: 28,
      refillThreshold: 7,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      medicationId: medTelmisartan.id,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:00'],
      startsOn: new Date('2026-01-01'),
      graceMinutes: 60,
      snoozeMinutes: 15,
      escalateToCaregivers: true,
    },
  });

  const medCalcium = await prisma.medication.create({
    data: {
      profileId: profileKamala.id,
      name: 'Shelcal 500',
      genericName: 'Calcium + Vitamin D3',
      strength: '500 mg / 250 IU',
      form: 'Tablet',
      instructions: 'Take after lunch',
      criticality: MedicationCriticality.STANDARD,
      prescribedBy: 'Dr. Anand Kulkarni',
      startDate: new Date('2026-01-01'),
      stockCount: 14,
      refillThreshold: 5,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      medicationId: medCalcium.id,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['13:00'],
      startsOn: new Date('2026-01-01'),
      graceMinutes: 60,
      snoozeMinutes: 15,
      escalateToCaregivers: false,
    },
  });

  // Appointments for Kamala
  await prisma.appointment.create({
    data: {
      profileId: profileKamala.id,
      title: 'Routine Cardiology & HbA1c Review',
      doctorName: 'Dr. Anand Kulkarni',
      specialty: 'Cardiology & Internal Medicine',
      clinicName: 'Ruby Hall Clinic OPD Wing B',
      address: '40 Sassoon Road, Pune, Maharashtra 411001',
      startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // In 5 days
      travelMinutes: 35,
      status: AppointmentStatus.SCHEDULED,
      isPrivate: false,
      notes: 'Bring fasting blood sugar log from past 2 weeks.',
      questionsToAsk: '1. Can we reduce the painkiller dosage? 2. Is knee swelling normal?',
    },
  });

  // Care Notes for Kamala
  await prisma.careNote.create({
    data: {
      profileId: profileKamala.id,
      authorMembershipId: rajeshMembership.id,
      body: 'Mother had a good walk this morning. Blood sugar before breakfast was 114 mg/dL.',
      isPrivate: false,
    },
  });

  // 3. Demo Profile 2: Col. Ashok Verma (New Delhi)
  const profileAshok = await prisma.careProfile.create({
    data: {
      ownerId: userAshok.id,
      displayName: 'Col. Ashok Verma',
      dateOfBirth: new Date('1945-08-15'),
      timezone: 'Asia/Kolkata',
      bloodType: 'B+',
      allergies: 'None known',
      conditions: 'Coronary Artery Disease, Hyperlipidemia',
      primaryDoctorName: 'Dr. Rajiv Sethi',
      preferredHospital: 'Max Super Speciality Hospital, Saket, New Delhi',
      emergencyCode: 'EMRG9912',
      emailShowsMedicineNames: false,
      readAloudEnabled: true,
    },
  });

  await prisma.membership.create({
    data: {
      profileId: profileAshok.id,
      userId: userAshok.id,
      role: Role.OWNER,
      scopes: {
        view_medications: true,
        manage_medications: true,
        view_appointments: true,
        manage_appointments: true,
        view_notes: true,
        write_notes: true,
        receive_missed_dose_alerts: true,
        view_private_items: true,
      },
      status: MembershipStatus.ACTIVE,
      passcodeHash: defaultPasscodeHash,
    },
  });

  await prisma.membership.create({
    data: {
      profileId: profileAshok.id,
      userId: userAnita.id,
      role: Role.CAREGIVER,
      scopes: {
        view_medications: true,
        manage_medications: true,
        view_appointments: true,
        manage_appointments: true,
        view_notes: true,
        write_notes: true,
        receive_missed_dose_alerts: true,
        view_private_items: false,
      },
      status: MembershipStatus.ACTIVE,
      passcodeHash: caregiverPasscodeHash,
    },
  });

  const medClopidogrel = await prisma.medication.create({
    data: {
      profileId: profileAshok.id,
      name: 'Clopidogrel',
      genericName: 'Clopidogrel Bisulfate',
      strength: '75 mg',
      form: 'Tablet',
      instructions: 'Take after breakfast with water',
      criticality: MedicationCriticality.CRITICAL,
      prescribedBy: 'Dr. Rajiv Sethi',
      startDate: new Date('2026-01-01'),
      stockCount: 12,
      refillThreshold: 5,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      medicationId: medClopidogrel.id,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['08:30'],
      startsOn: new Date('2026-01-01'),
      graceMinutes: 60,
      snoozeMinutes: 15,
      escalateToCaregivers: true,
    },
  });

  const medAtorvastatin = await prisma.medication.create({
    data: {
      profileId: profileAshok.id,
      name: 'Atorvastatin',
      genericName: 'Atorvastatin Calcium',
      strength: '20 mg',
      form: 'Tablet',
      instructions: 'Take at bedtime',
      criticality: MedicationCriticality.STANDARD,
      prescribedBy: 'Dr. Rajiv Sethi',
      startDate: new Date('2026-01-01'),
      stockCount: 30,
      refillThreshold: 7,
      isActive: true,
    },
  });

  await prisma.schedule.create({
    data: {
      medicationId: medAtorvastatin.id,
      rrule: 'FREQ=DAILY;INTERVAL=1',
      timesOfDay: ['21:00'],
      startsOn: new Date('2026-01-01'),
      graceMinutes: 60,
      snoozeMinutes: 15,
      escalateToCaregivers: false,
    },
  });

  console.log('✅ Seeding completed successfully!');
  console.log('👤 Demo User 1: kamala@eldercare.demo (Password: Password123!, PIN: 1234)');
  console.log('👤 Caregiver 1: rajesh@eldercare.demo (Password: Password123!, PIN: 5678)');
  console.log('👤 Demo User 2: ashok@eldercare.demo (Password: Password123!, PIN: 1234)');
  console.log('👤 Caregiver 2: anita@eldercare.demo (Password: Password123!, PIN: 5678)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
