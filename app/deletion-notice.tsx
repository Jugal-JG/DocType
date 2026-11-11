"use client";

import { useEffect, useState } from "react";

export function DeletionNotice({ title, undo, dismiss }: {
  title: string; undo: () => Promise<boolean>; dismiss: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [expired, setExpired] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!restoring && (expired || failed)) {
      const timer = setTimeout(dismiss, failed ? 4000 : 0);
      return () => clearTimeout(timer);
    }
  }, [dismiss, expired, failed, restoring]);

  return <div className="delete-toast">
    <div className="undo-progress" aria-hidden />
    <span role="status">{failed ? "Couldn’t restore the document." : `Deleted ${title}`}</span>
    {!failed && <button disabled={expired || restoring} onClick={async () => {
      setRestoring(true);
      if (await undo()) dismiss();
      else { setFailed(true); setRestoring(false); }
    }}>{restoring ? "Restoring…" : "Undo"}</button>}
  </div>;
}
