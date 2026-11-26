// The web side of the CRM copy. The name itself is in shared/product.ts; CRM_ONLY stays here because it reads a Vite value.
export { PRODUCT_NAME } from "../../shared/product";
export const CRM_ONLY: boolean = import.meta.env?.VITE_APP_MODE === "crm";
