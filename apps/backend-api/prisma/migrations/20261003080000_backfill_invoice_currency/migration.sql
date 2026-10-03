-- Invoices take their currency from the shift they were issued for. Before markets existed the default was GBP, so
-- existing invoices would disagree with their shift (and organization) after the market change. Align them.
UPDATE "Invoice" AS i
SET "currency" = s."currency"
FROM "Timesheet" AS t
JOIN "Shift" AS s ON s."id" = t."shiftId"
WHERE i."timesheetId" = t."id"
  AND i."currency" IS DISTINCT FROM s."currency";
