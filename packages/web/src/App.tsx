import { Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import EntityConfigPage from "./pages/EntityConfigPage";

export default function App() {
  return (
    <Routes>
      <Route path="/config" element={<EntityConfigPage />} />
      <Route path="/*" element={<DashboardPage />} />
    </Routes>
  );
}
