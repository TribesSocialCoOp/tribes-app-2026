import { Metadata } from "next";
import OurStoryClient from "./our-story-client";

export const metadata: Metadata = {
  title: 'Our Story',
  description: 'Understand the world together. Explore curated topics, share insights, and engage in constructive discussions.',
};

export default function OurStoryPage() {
  return <OurStoryClient />;
}
