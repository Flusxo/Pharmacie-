export type Role = 'patient' | 'doctor' | 'pharmacy' | 'staff';
export type StaffRole = 'admin' | 'support' | 'moderator';

export interface User {
  id: string;
  email: string;
  role: Role;
  status: 'pending' | 'active' | 'suspended';
  verified: boolean;
  displayName: string;
  emailNotifications: boolean;
  totpEnabled?: boolean;
  language?: 'fr' | 'en';
  patient?: {
    firstName: string;
    lastName: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
  };
  doctor?: { firstName: string; lastName: string; rpps: string; speciality: string; verified: boolean; rejectionReason: string | null };
  pharmacy?: {
    name: string;
    finess: string;
    address: string;
    city: string;
    latitude: number;
    longitude: number;
    verified: boolean;
    paused: boolean;
    rejectionReason: string | null;
    openingHours: OpeningHours;
    onDuty: string[];
  };
  staff?: { fullName: string; staffRole: StaffRole };
}

export type OpeningHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string][]>>;

export interface Medicine {
  id: string;
  cip13: string;
  name: string;
  activeSubstance: string;
  form: string;
  dosage: string;
  category: string;
  requiresPrescription: boolean;
  imageUrl: string | null;
  description: string;
  ageNote: string;
  /** English versions (empty: fall back to French). */
  descriptionEn?: string;
  ageNoteEn?: string;
  availableAt?: number;
}

export interface NearbyPharmacy {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  openingHours: OpeningHours;
  onDuty: string[];
  distanceKm: number;
  quantity?: number;
  priceEur?: number | null;
  inStock?: boolean;
  lowStock?: boolean;
}

export interface OptionItem {
  itemId: string;
  medicineId: string;
  name: string;
  dosage: string;
  needed: number;
  available: number;
  priceEur: number | null;
}
export interface PharmacyOption extends Omit<NearbyPharmacy, 'distanceKm'> {
  distanceKm: number | null;
  items: OptionItem[];
  missing: OptionItem[];
  totalPriceEur: number;
}
export interface OptionsResponse {
  status: string;
  canChoose: boolean;
  usedLocation: { lat: number; lon: number } | null;
  full: PharmacyOption[];
  partial: PharmacyOption[];
}

export type OrderStatus = 'accepted' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface OrderItem {
  id: string;
  medicineId: string;
  name: string;
  dosage: string;
  form: string;
  category: string;
  requiresPrescription: boolean;
  quantity: number;
  excluded: boolean;
  priceEur: number | null;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  cancelRequestedAt: string | null;
  pharmacyName: string;
  pharmacyCity: string;
  items: OrderItem[];
}

export interface OrderDetails {
  id: string;
  requestId: string;
  status: OrderStatus;
  cancelRequestedAt: string | null;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  pharmacy: { id: string; name: string; address: string; city: string; phone: string | null; latitude: number; longitude: number };
  destination: { latitude: number | null; longitude: number | null };
  items: OrderItem[];
  history: { status: OrderStatus; changedAt: string }[];
}

export interface RequestSummary {
  id: string;
  status: string;
  source: 'patient' | 'doctor';
  createdAt: string;
  orderId: string | null;
  orderStatus: OrderStatus | null;
  pharmacyName: string | null;
  items: { name: string; dosage: string; form: string; category: string; quantity: number }[];
}

export interface RequestDetails {
  id: string;
  status: string;
  source: 'patient' | 'doctor';
  prescriptionNote: string | null;
  instructions: string | null;
  createdAt: string;
  doctorName: string | null;
  orderId: string | null;
  orderStatus: OrderStatus | null;
  items: {
    id: string;
    quantity: number;
    excluded: boolean;
    medicineId: string;
    name: string;
    dosage: string;
    form: string;
    category: string;
    requiresPrescription: boolean;
  }[];
  pharmacies: { id: string; name: string; city: string; response: string; sentAt: string; answerBy: string }[];
  substitution: { id: string; itemId: string; originalName: string; proposedName: string; proposedDosage: string } | null;
}

export interface Notification {
  id: number;
  kind: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
