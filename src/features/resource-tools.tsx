import { useState } from "react";
import {
  pageOperations,
  resourceOperationValues,
} from "../lib/page-operations";
import { Dialog } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { PageOperations } from "./page-operations";

export function ResourceTools({
  page,
  id,
  name,
  namespace,
}: {
  page: string;
  id: string;
  name: string;
  namespace?: string;
}) {
  const [open, setOpen] = useState(false);
  const initialValues = resourceOperationValues(page, id, namespace, name);
  const operations = pageOperations[page];
  if (!operations || !initialValues) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)} aria-label={`Manage ${name}`}>
        Manage
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={name}
        description={`${page} · ${id}`}
        className="resource-tools-dialog"
      >
        {open && (
          <PageOperations
            key={`${id}-${namespace}`}
            operations={operations}
            initialValues={initialValues}
          />
        )}
      </Dialog>
    </>
  );
}
