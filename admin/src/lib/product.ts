// The CRM sold to other businesses. Name and mark live here only; the platform build never reads PRODUCT_NAME.
export const CRM_ONLY: boolean = import.meta.env?.VITE_APP_MODE === "crm";
export const PRODUCT_NAME = "CRM";
