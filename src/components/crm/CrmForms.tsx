"use client";

// The CRM forms live in ./forms/ (one file per form, plus shared hooks/controls and the lead/client field sets).
// This file keeps the original import path and names working.
export type { Opt } from "./forms/shared";
export { LeadCreate } from "./forms/LeadCreate";
export { LeadEdit } from "./forms/LeadEdit";
export { ConvertLead } from "./forms/ConvertLead";
export { ClientCreate } from "./forms/ClientCreate";
export { ClientEdit } from "./forms/ClientEdit";
export { ContactForm } from "./forms/ContactForm";
export { OpportunityForm } from "./forms/OpportunityForm";
export { LostReasonDialog } from "./forms/LostReasonDialog";
export { FollowUpPicker } from "./forms/FollowUpPicker";
