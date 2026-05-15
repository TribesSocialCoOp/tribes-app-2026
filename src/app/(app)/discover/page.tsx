import { Metadata } from "next";
import DiscoverClient from "./discover-client";

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Explore tribes, mood streams, events, and more.',
};

export default function DiscoverPage() {
  return <DiscoverClient />;
}
