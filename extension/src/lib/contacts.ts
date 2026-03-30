/**
 * Contacts — Local address book management
 */

export interface Contact {
  address: string;
  name: string;
}

const STORAGE_KEY = 'nixwallet_contacts';

/** Save a new contact */
export async function saveContact(contact: Contact) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  const result = await chrome.storage.local.get(STORAGE_KEY);
  const contacts = (result[STORAGE_KEY] || []) as Contact[];
  
  // Update if address exists, else add
  const index = contacts.findIndex(c => c.address.toLowerCase() === contact.address.toLowerCase());
  if (index !== -1) {
    contacts[index] = contact;
  } else {
    contacts.push(contact);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: contacts });
}

/** Get all saved contacts */
export async function getContacts(): Promise<Contact[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) return [];

  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] || []) as Contact[];
}

/** Delete a contact */
export async function deleteContact(address: string) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const contacts = (result[STORAGE_KEY] || []) as Contact[];
  
  const filtered = contacts.filter(c => c.address.toLowerCase() !== address.toLowerCase());
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}
