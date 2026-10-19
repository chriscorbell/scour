import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/Shell.tsx";
import { Toaster } from "./components/ui/Toast.tsx";
import { HuntPage } from "./features/hunt/HuntPage.tsx";
import { NewHuntPage } from "./features/new/NewHuntPage.tsx";
import { queryClient } from "./lib/client.ts";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <Shell>
            <Routes>
              <Route path="/" element={<NewHuntPage />} />
              <Route path="/hunts/:id" element={<HuntPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
          <Toaster />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
