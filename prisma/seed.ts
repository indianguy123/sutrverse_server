import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.appointment.deleteMany();
  await prisma.operatingHours.deleteMany();
  await prisma.stylist.deleteMany();
  await prisma.user.deleteMany();
  await prisma.salon.deleteMany();

  // 1. Create salon
  const salon = await prisma.salon.create({
    data: {
      name: 'Luxe Studio',
      timezone: 'Asia/Kolkata',
      address: '42 MG Road, Bengaluru, Karnataka 560001',
      phone: '+91 80 4567 8900',
      email: 'hello@luxestudio.com',
    },
  });
  console.log(`✅ Salon created: ${salon.name} (${salon.id})`);

  // 2. Create operating hours (Mon-Sat 09:00-18:00, Sunday closed)
  const days = [
    { dayOfWeek: 0, openTime: '09:00', closeTime: '18:00', isClosed: true },  // Sunday
    { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Monday
    { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Tuesday
    { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Wednesday
    { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Thursday
    { dayOfWeek: 5, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Friday
    { dayOfWeek: 6, openTime: '09:00', closeTime: '18:00', isClosed: false }, // Saturday
  ];

  await prisma.operatingHours.createMany({
    data: days.map((d) => ({ ...d, salonId: salon.id })),
  });
  console.log('✅ Operating hours created');

  // 3. Create owner user
  const ownerPasswordHash = await bcrypt.hash('password123', 12);
  const ownerUser = await prisma.user.create({
    data: {
      email: 'owner@salon.com',
      password: ownerPasswordHash,
      role: 'OWNER',
    },
  });
  console.log(`✅ Owner user created: ${ownerUser.email}`);

  // 4. Create stylist users
  const stylistPasswordHash = await bcrypt.hash('password123', 12);
  const stylistUser1 = await prisma.user.create({
    data: {
      email: 'stylist1@salon.com',
      password: stylistPasswordHash,
      role: 'STYLIST',
    },
  });
  const stylistUser2 = await prisma.user.create({
    data: {
      email: 'stylist2@salon.com',
      password: stylistPasswordHash,
      role: 'STYLIST',
    },
  });
  console.log('✅ Stylist users created');

  // 5. Create stylists
  const stylist1 = await prisma.stylist.create({
    data: {
      salonId: salon.id,
      userId: stylistUser1.id,
      name: 'Priya Sharma',
      bio: 'Expert colorist with 8 years of experience. Specializes in balayage, highlights, and creative color transformations.',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_face/sample.jpg',
      specialties: ['Balayage', 'Highlights', 'Color Correction', 'Keratin Treatment'],
      slotDuration: 30,
    },
  });

  const stylist2 = await prisma.stylist.create({
    data: {
      salonId: salon.id,
      userId: stylistUser2.id,
      name: 'Arjun Mehta',
      bio: 'Master stylist specializing in precision cuts and modern men\'s grooming. Clean fades and textured styles.',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_face/sample.jpg',
      specialties: ['Precision Cuts', 'Fades', 'Beard Styling', 'Men\'s Grooming'],
      slotDuration: 30,
    },
  });

  const stylist3 = await prisma.stylist.create({
    data: {
      salonId: salon.id,
      name: 'Meera Kapoor',
      bio: 'Bridal specialist and hair extension expert. Creates stunning looks for weddings and special occasions.',
      photoUrl: 'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_face/sample.jpg',
      specialties: ['Bridal Styling', 'Hair Extensions', 'Updos', 'Deep Conditioning'],
      slotDuration: 60,
    },
  });
  console.log('✅ Stylists created');

  // 6. Create appointments (spread across today + next 3 days)
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const makeDate = (daysOffset: number, hour: number, minute: number = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hour, minute, 0, 0);
    // Convert IST to UTC (IST = UTC+5:30)
    return new Date(d.getTime() - 5.5 * 60 * 60 * 1000);
  };

  const appointments = [
    // Today
    {
      stylistId: stylist1.id,
      customerName: 'Ananya Gupta',
      customerPhone: '+91 98765 43210',
      customerEmail: 'ananya@example.com',
      service: 'Balayage Color',
      startTime: makeDate(0, 10, 0),
      endTime: makeDate(0, 10, 30),
      status: 'CONFIRMED' as const,
      price: 3500,
    },
    {
      stylistId: stylist1.id,
      customerName: 'Ravi Kumar',
      customerPhone: '+91 98765 43211',
      service: 'Highlights',
      startTime: makeDate(0, 11, 0),
      endTime: makeDate(0, 11, 30),
      status: 'CONFIRMED' as const,
      price: 2500,
    },
    {
      stylistId: stylist2.id,
      customerName: 'Vikram Singh',
      customerPhone: '+91 98765 43212',
      customerEmail: 'vikram@example.com',
      service: 'Precision Haircut',
      startTime: makeDate(0, 10, 30),
      endTime: makeDate(0, 11, 0),
      status: 'CONFIRMED' as const,
      price: 800,
    },
    {
      stylistId: stylist3.id,
      customerName: 'Deepika Nair',
      customerPhone: '+91 98765 43213',
      service: 'Bridal Trial',
      startTime: makeDate(0, 11, 0),
      endTime: makeDate(0, 12, 0),
      status: 'CONFIRMED' as const,
      price: 5000,
    },
    // Tomorrow
    {
      stylistId: stylist1.id,
      customerName: 'Kavya Reddy',
      customerPhone: '+91 98765 43214',
      customerEmail: 'kavya@example.com',
      service: 'Color Correction',
      startTime: makeDate(1, 9, 0),
      endTime: makeDate(1, 9, 30),
      status: 'CONFIRMED' as const,
      price: 4000,
    },
    {
      stylistId: stylist2.id,
      customerName: 'Rohit Joshi',
      customerPhone: '+91 98765 43215',
      service: 'Fade Haircut + Beard',
      startTime: makeDate(1, 14, 0),
      endTime: makeDate(1, 14, 30),
      status: 'CONFIRMED' as const,
      price: 1200,
    },
    {
      stylistId: stylist3.id,
      customerName: 'Sanjana Bhat',
      customerPhone: '+91 98765 43216',
      service: 'Hair Extensions',
      startTime: makeDate(1, 15, 0),
      endTime: makeDate(1, 16, 0),
      status: 'CONFIRMED' as const,
      price: 8000,
    },
    // Day after tomorrow
    {
      stylistId: stylist1.id,
      customerName: 'Neha Agarwal',
      customerPhone: '+91 98765 43217',
      service: 'Keratin Treatment',
      startTime: makeDate(2, 10, 0),
      endTime: makeDate(2, 10, 30),
      status: 'CONFIRMED' as const,
      price: 6000,
    },
    {
      stylistId: stylist2.id,
      customerName: 'Aditya Patel',
      customerPhone: '+91 98765 43218',
      service: 'Men\'s Grooming Package',
      startTime: makeDate(2, 11, 0),
      endTime: makeDate(2, 11, 30),
      status: 'CONFIRMED' as const,
      price: 1500,
    },
    // 3 days out
    {
      stylistId: stylist1.id,
      customerName: 'Tanya Chopra',
      customerPhone: '+91 98765 43219',
      service: 'Root Touch-up',
      startTime: makeDate(3, 13, 0),
      endTime: makeDate(3, 13, 30),
      status: 'CONFIRMED' as const,
      price: 2000,
    },
    {
      stylistId: stylist3.id,
      customerName: 'Lavanya Iyer',
      customerPhone: '+91 98765 43220',
      service: 'Deep Conditioning + Blowout',
      startTime: makeDate(3, 10, 0),
      endTime: makeDate(3, 11, 0),
      status: 'CONFIRMED' as const,
      price: 3000,
    },
    // Some completed appointments (past)
    {
      stylistId: stylist1.id,
      customerName: 'Previous Customer',
      customerPhone: '+91 98765 99999',
      service: 'Haircut',
      startTime: makeDate(-1, 10, 0),
      endTime: makeDate(-1, 10, 30),
      status: 'COMPLETED' as const,
      price: 500,
    },
  ];

  for (const appt of appointments) {
    await prisma.appointment.create({
      data: {
        stylistId: appt.stylistId,
        customerName: appt.customerName,
        customerPhone: appt.customerPhone,
        customerEmail: (appt as any).customerEmail || null,
        service: appt.service,
        startTime: appt.startTime,
        endTime: appt.endTime,
        status: appt.status,
        price: appt.price,
      },
    });
  }
  console.log(`✅ ${appointments.length} appointments created`);

  console.log('\n🎉 Seeding complete!');
  console.log(`\n📋 Important IDs:`);
  console.log(`   SALON_ID=${salon.id}`);
  console.log(`\n🔑 Login Credentials:`);
  console.log(`   Owner: owner@salon.com / password123`);
  console.log(`   Stylist 1: stylist1@salon.com / password123`);
  console.log(`   Stylist 2: stylist2@salon.com / password123`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
