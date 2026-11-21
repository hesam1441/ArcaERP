import type { ContainerSealEntry, Order } from '../types';

export const shippingNumbers = (text?: string): string[] => (text || '').split(/[\n,،;؛]+/).map(value => value.trim()).filter(Boolean);
export const containerEntriesFor = (order: Order): ContainerSealEntry[] => {
  if (order.ContainerSealEntries?.length) return order.ContainerSealEntries;
  return shippingNumbers(order.ContainerNo).map(value => {
    const [containerNo = '', ...seal] = value.split('/');
    return { containerNo: containerNo.trim(), sealNo: seal.join('/').trim() };
  });
};
export const containerTextFor = (entries: ContainerSealEntry[]) => entries.filter(entry => entry.containerNo || entry.sealNo)
  .map(entry => entry.sealNo ? `${entry.containerNo}/${entry.sealNo}` : entry.containerNo).join(', ');
export const packingTransportLines = (order: Order) => [
  ...containerEntriesFor(order).filter(entry => entry.containerNo || entry.sealNo)
    .map(entry => entry.sealNo ? `${entry.containerNo} / ${entry.sealNo}` : entry.containerNo),
  ...shippingNumbers(order.TruckNo).map(number => `Truck No.: ${number}`),
];
