import { useState } from "react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { DemoSection } from "./components/DemoSection";
import { Deliverables } from "./components/Deliverables";
import { Pricing } from "./components/Pricing";
import { Footer } from "./components/Footer";
import { WaitlistModal } from "./components/WaitlistModal";

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);

  const openWaitlist = () => setModalOpen(true);

  return (
    <div className="min-h-screen bg-surface">
      <Header onConnect={openWaitlist} />
      <main>
        <Hero onConnect={openWaitlist} />
        <DemoSection />
        <HowItWorks />
        <Deliverables />
        <Pricing onConnect={openWaitlist} />
      </main>
      <Footer />
      <WaitlistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
