import { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Contacts from "expo-contacts";
import { palette } from "@/constants/theme";
import { Search, User, Phone, X } from "lucide-react-native";

export type ContactSummary = {
  id: string;
  name: string;
  phone?: string;
};

export function ContactPicker({
  onSelect,
  onClose,
}: {
  onSelect: (contact: ContactSummary) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === "granted") {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
          });

          if (data.length > 0) {
            const list: ContactSummary[] = data
              .filter((c) => c.name && c.phoneNumbers && c.phoneNumbers.length > 0)
              .map((c) => ({
                id: c.id || Math.random().toString(),
                name: c.name,
                phone: c.phoneNumbers?.[0]?.number,
              }));
            setContacts(list);
          }
        } else {
          setError("Permission to access contacts was denied");
        }
      } catch (e) {
        setError("Could not load contacts");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(s) || (c.phone && c.phone.includes(s))
    );
  }, [contacts, search]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Share tracking link</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <X size={20} color={palette.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Search size={18} color={palette.inkSoft} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          placeholderTextColor={palette.inkSoft}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.aegean} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.item, pressed && { backgroundColor: palette.line }]}
              onPress={() => onSelect(item)}
            >
              <View style={styles.avatar}>
                <User size={20} color={palette.aegeanDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPhone}>{item.phone}</Text>
              </View>
              <Phone size={16} color={palette.inkSoft} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No contacts found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  title: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 20,
    color: palette.ink,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.limestone,
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Geist_500Medium",
    fontSize: 16,
    color: palette.ink,
  },
  center: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.aegeanSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  itemName: {
    fontFamily: "Geist_700Bold",
    fontSize: 16,
    color: palette.ink,
  },
  itemPhone: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
    color: palette.inkSoft,
    marginTop: 2,
  },
  errorText: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
    color: palette.ochre,
    textAlign: "center",
  },
  emptyText: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
    color: palette.inkSoft,
    textAlign: "center",
  },
});
