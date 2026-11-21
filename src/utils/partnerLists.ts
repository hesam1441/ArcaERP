import { Customer, Supplier } from "../types";

/** A party may intentionally be both a buyer and a supplier. */
export const getCustomerList = (customers: Customer[], _suppliers: Supplier[]) => customers;