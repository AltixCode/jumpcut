import Purchases from "react-native-purchases";

process.env.EXPO_PUBLIC_RC_IOS_KEY = "test-ios-key";
process.env.EXPO_PUBLIC_RC_ANDROID_KEY = "test-android-key";

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn().mockResolvedValue(undefined),
    setLogLevel: jest.fn(),
    getOfferings: jest.fn(),
    getCustomerInfo: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
  LOG_LEVEL: { WARN: "WARN", ERROR: "ERROR" },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getLifetimePackage } = require("../purchases") as typeof import("../purchases");

const mockedGetOfferings = Purchases.getOfferings as jest.Mock;

const somePackage = { identifier: "lifetime", product: { priceString: "$4.99" } };

describe("getLifetimePackage", () => {
  beforeEach(() => {
    mockedGetOfferings.mockReset();
  });

  it("returns the package on the first attempt when it is already there", async () => {
    mockedGetOfferings.mockResolvedValue({ current: { lifetime: somePackage } });

    await expect(getLifetimePackage()).resolves.toBe(somePackage);
    expect(mockedGetOfferings).toHaveBeenCalledTimes(1);
  });

  it("retries when StoreKit has not resolved the product yet, and resolves once it has", async () => {
    mockedGetOfferings
      .mockResolvedValueOnce({ current: { lifetime: undefined, availablePackages: [] } })
      .mockResolvedValueOnce({ current: { lifetime: undefined, availablePackages: [] } })
      .mockResolvedValueOnce({ current: { lifetime: somePackage } });

    jest.useFakeTimers();
    const promise = getLifetimePackage();
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe(somePackage);
    jest.useRealTimers();

    expect(mockedGetOfferings).toHaveBeenCalledTimes(3);
  });

  it("falls back to null once every retry finds no package", async () => {
    mockedGetOfferings.mockResolvedValue({ current: { lifetime: undefined, availablePackages: [] } });

    jest.useFakeTimers();
    const promise = getLifetimePackage();
    await jest.advanceTimersByTimeAsync(500);
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBeNull();
    jest.useRealTimers();

    expect(mockedGetOfferings).toHaveBeenCalledTimes(4);
  });

  it("keeps retrying through a transient error instead of giving up on the first one", async () => {
    mockedGetOfferings
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ current: { lifetime: somePackage } });

    jest.useFakeTimers();
    const promise = getLifetimePackage();
    await jest.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBe(somePackage);
    jest.useRealTimers();
  });
});
