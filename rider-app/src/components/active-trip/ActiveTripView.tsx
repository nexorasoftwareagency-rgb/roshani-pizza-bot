// === src/components/active-trip/ActiveTripView.tsx ===
import { useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { Navigation as NavigationIcon } from "lucide-react";
import { useActiveOrder, type ActiveOrder } from "@/hooks/useActiveOrder";
import { useAuth } from "@/hooks/useAuth";
import { useRiderContext } from "@/contexts/RiderContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { useGeolocation } from "@/hooks/useGeolocation";
import { TripMap } from "@/components/active-trip/TripMap";
import { TaskCard } from "@/components/active-trip/TaskCard";
import { RouteOptimizer } from "@/components/active-trip/RouteOptimizer";
import { VerificationModal } from "@/components/modals/VerificationModal";
import { OTPSheet } from "@/components/modals/OTPSheet";
import { PaymentSheet } from "@/components/modals/PaymentSheet";
import { SuccessOverlay } from "@/components/modals/SuccessOverlay";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import {
  markReachedOutlet,
  confirmPickup,
  markReachedDrop,
  verifyOtp as verifyOtpService,
  resendOtp as resendOtpService,
  completeDelivery,
  ProximityError,
} from "@/services/orderService";
import { logRiderError } from "@/services/auditService";
import { enqueueOfflineAction } from "@/components/shared/OfflineQueue";
import { toast } from "@/hooks/use-toast";
import { getDistanceKm } from "@/lib/utils";
import { PROXIMITY } from "@/lib/constants";

function OrderTaskPanel({ order }: { order: ActiveOrder }) {
  const { user } = useAuth();
  const { rider } = useRiderContext();
  const { location } = useLocationContext();
  const { requestPosition } = useGeolocation();
  const [, navigate] = useWouterLocation();

  const [sliderLoading, setSliderLoading] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [verifiedBy, setVerifiedBy] = useState<"OTP" | "ADMIN_FALLBACK">("OTP");

  const step = order.step;
  const atOutlet = step < 2;

  const target = atOutlet
    ? { label: order.outletName, address: `${order.outletName} outlet`, lat: order.outletLat, lng: order.outletLng, phone: undefined }
    : {
        label: order.customerName || "Customer",
        address: order.address,
        lat: order.lat,
        lng: order.lng,
        phone: order.customerPhone || order.phone,
      };

  // Roshani's real reachedDropLocation() has NO proximity gate at all (verified
  // against app.js) — only steps 0/1 (reach outlet / confirm pickup) are gated,
  // both using the same uniform 0.5km radius.
  const gated = step < 2;
  const distanceKm = gated && location ? getDistanceKm(location.lat, location.lng, target.lat, target.lng) : null;
  const proximityOk = distanceKm === null || distanceKm <= PROXIMITY.PICKUP_RADIUS_KM;

  async function resolvePosition(): Promise<{ lat: number; lng: number; accuracy?: number }> {
    if (location) return location;
    try {
      return await requestPosition();
    } catch {
      throw new Error("Could not read your location. Enable GPS and try again.");
    }
  }

  async function handleSlideComplete() {
    if (sliderLoading) return;
    setSliderLoading(true);
    try {
      if (!navigator.onLine) {
        if (step === 0) {
          enqueueOfflineAction("REACHED_OUTLET", {
            outlet: order.outlet,
            orderId: order.id,
            outletLat: order.outletLat,
            outletLng: order.outletLng,
          });
          toast.warning("You're offline", { description: "This will sync automatically once you're back online." });
        } else if (step === 1) {
          setVerifyOpen(true);
        } else if (step === 2) {
          enqueueOfflineAction("UPDATE_STATUS", {
            subtype: "reachedDrop",
            outlet: order.outlet,
            orderId: order.id,
            customerPhone: order.customerPhone || order.phone,
          });
          toast.warning("You're offline", { description: "This will sync automatically once you're back online." });
        }
        return;
      }

      if (step === 0) {
        const pos = await resolvePosition();
        await markReachedOutlet({
          outlet: order.outlet,
          orderId: order.id,
          riderLat: pos.lat,
          riderLng: pos.lng,
          accuracy: pos.accuracy,
          outletLat: order.outletLat,
          outletLng: order.outletLng,
        });
        toast.success("Arrived at outlet");
      } else if (step === 1) {
        setVerifyOpen(true);
      } else if (step === 2) {
        // No GPS/proximity gate for reaching the drop location — matches the real app.
        await markReachedDrop({
          outlet: order.outlet,
          orderId: order.id,
          customerPhone: order.customerPhone || order.phone,
        });
        toast.success("Reached drop location", { description: "Customer notified via WhatsApp." });
        setOtpOpen(true);
      }
    } catch (err) {
      if (err instanceof ProximityError) {
        toast.error("Too far away", { description: err.message });
      } else {
        toast.error((err as Error)?.message || "Action failed. Please try again.");
        if (user?.uid) logRiderError(user.uid, `ActiveTripView.step${step}`, err);
      }
    } finally {
      setSliderLoading(false);
    }
  }

  async function handleConfirmPickup() {
    setVerifyLoading(true);
    try {
      if (!navigator.onLine) {
        enqueueOfflineAction("UPDATE_STATUS", {
          subtype: "confirmPickup",
          outlet: order.outlet,
          orderId: order.id,
          outletLat: order.outletLat,
          outletLng: order.outletLng,
          riderPhone: rider?.phone || "",
          customerPhone: order.customerPhone || order.phone,
        });
        toast.warning("You're offline", { description: "Pickup will be confirmed automatically once you're back online." });
        setVerifyOpen(false);
        return;
      }
      const pos = await resolvePosition();
      await confirmPickup({
        outlet: order.outlet,
        orderId: order.id,
        riderLat: pos.lat,
        riderLng: pos.lng,
        accuracy: pos.accuracy,
        outletLat: order.outletLat,
        outletLng: order.outletLng,
        riderPhone: rider?.phone || "",
        customerPhone: order.customerPhone || order.phone,
      });
      toast.success("Order picked up!", { description: "Navigate to the customer now." });
      setVerifyOpen(false);
    } catch (err) {
      if (err instanceof ProximityError) {
        toast.error("Too far from outlet", { description: err.message });
      } else {
        toast.error((err as Error)?.message || "Could not confirm pickup.");
        if (user?.uid) logRiderError(user.uid, "ActiveTripView.confirmPickup", err);
      }
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleVerifyOtp(code: string) {
    const result = await verifyOtpService({
      outlet: order.outlet,
      orderId: order.id,
      enteredOtp: code,
      actualOtp: order.deliveryOTP || order.otp || "",
      backupCode: order.backupCode,
      isAdmin: rider?.isAdmin,
    });
    if (result.success) {
      setVerifiedBy(result.verifiedBy);
      setOtpOpen(false);
      setPayOpen(true);
    }
    return result;
  }

  async function handleResendOtp() {
    await resendOtpService({ outlet: order.outlet, orderId: order.id });
  }

  function handleEmergencyOverride() {
    if (!order.backupCode) {
      toast.error("No backup code configured for this outlet.");
      return;
    }
    verifyOtpService({
      outlet: order.outlet,
      orderId: order.id,
      enteredOtp: order.backupCode,
      actualOtp: order.deliveryOTP || order.otp || "",
      backupCode: order.backupCode,
      isAdmin: true,
    }).then((result) => {
      if (result.success) {
        setVerifiedBy("ADMIN_FALLBACK");
        setOtpOpen(false);
        setPayOpen(true);
        toast.warning("Emergency override used", { description: "This is logged for audit." });
      }
    });
  }

  async function handleConfirmPayment(method: "CASH" | "UPI") {
    if (!user?.uid) return;
    setPayLoading(true);
    try {
      await completeDelivery({
        outlet: order.outlet,
        orderId: order.id,
        riderId: user.uid,
        deliveryFee: order.deliveryFee,
        paymentMethod: method,
        verifiedBy,
      });
      setPayOpen(false);
      setSuccessOpen(true);
    } catch (err) {
      toast.error("Could not complete delivery. Please try again.");
      if (user?.uid) logRiderError(user.uid, "ActiveTripView.completeDelivery", err);
    } finally {
      setPayLoading(false);
    }
  }

  const sliderLabel = step === 0 ? "SLIDE TO REACH OUTLET" : step === 1 ? "SLIDE TO PICK UP" : "SLIDE TO REACH CUSTOMER";

  return (
    <>
      <TaskCard
        order={order}
        step={step}
        targetLabel={target.label}
        targetAddress={target.address}
        distanceKm={distanceKm}
        proximityOk={proximityOk}
        sliderLabel={sliderLabel}
        sliderLocked={step >= 3}
        sliderLoading={sliderLoading}
        onSlideComplete={handleSlideComplete}
        onReopenOtp={() => setOtpOpen(true)}
        contactPhone={target.phone}
        destLat={target.lat}
        destLng={target.lng}
      />

      <VerificationModal open={verifyOpen} onOpenChange={setVerifyOpen} items={order.items} onConfirm={handleConfirmPickup} loading={verifyLoading} />
      <OTPSheet
        open={otpOpen}
        onOpenChange={setOtpOpen}
        outlet={order.outlet}
        orderId={order.id}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        onLater={() => setOtpOpen(false)}
        onEmergencyOverride={handleEmergencyOverride}
        isAdmin={rider?.isAdmin}
      />
      <PaymentSheet open={payOpen} onOpenChange={setPayOpen} total={order.total} onConfirm={handleConfirmPayment} loading={payLoading} />
      <SuccessOverlay
        open={successOpen}
        orderId={order.id}
        earnedAmount={order.deliveryFee}
        onClose={() => {
          setSuccessOpen(false);
          navigate("/dashboard");
        }}
      />
    </>
  );
}

export function ActiveTripView() {
  const { activeOrder, secondaryOrders, allActiveOrders, loading, error, retry } = useActiveOrder();
  const { location } = useLocationContext();

  if (loading) return <LoadingSpinner fullscreen label="Loading your active trip..." />;

  if (error) {
    return (
      <ErrorState
        title="Couldn't load your active trip"
        description="Check your connection and try again."
        onRetry={retry}
      />
    );
  }

  if (!activeOrder) {
    return (
      <EmptyState
        icon={<NavigationIcon />}
        title="No active trip currently"
        description="Accept a pickup order from the Pickup tab to see your live delivery view here."
      />
    );
  }

  const primaryTarget = activeOrder.step < 2
    ? { lat: activeOrder.outletLat, lng: activeOrder.outletLng, label: `${activeOrder.outletIcon} ${activeOrder.outletName}`, color: activeOrder.outletColor }
    : { lat: activeOrder.lat, lng: activeOrder.lng, label: activeOrder.customerName || "Customer", color: "#1E293B" };

  const secondaryTarget = activeOrder.step < 2
    ? { lat: activeOrder.lat, lng: activeOrder.lng, label: activeOrder.customerName || "Customer", color: "#1E293B" }
    : { lat: activeOrder.outletLat, lng: activeOrder.outletLng, label: `${activeOrder.outletIcon} ${activeOrder.outletName}`, color: activeOrder.outletColor };

  return (
    <div className="px-3.5 pt-4 pb-6">
      <TripMap
        destination={primaryTarget}
        destinationLabel={primaryTarget.label}
        destinationColor={primaryTarget.color}
        secondaryStop={secondaryTarget}
      />

      {secondaryOrders.length > 0 && (
        <RouteOptimizer
          primary={activeOrder}
          secondary={secondaryOrders}
          riderLat={location?.lat ?? activeOrder.outletLat}
          riderLng={location?.lng ?? activeOrder.outletLng}
        />
      )}

      {allActiveOrders.map((order) => (
        <OrderTaskPanel key={order.id} order={order} />
      ))}
    </div>
  );
}
