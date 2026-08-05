package app.forgedesk.interfaces.rest.landlord;

import app.forgedesk.application.landlord.LandlordApplicationService;
import app.forgedesk.application.landlord.LandlordApplicationService.RoomSummary;
import app.forgedesk.application.landlord.LandlordApplicationService.RoomView;
import app.forgedesk.interfaces.security.RequestIdentity;
import app.forgedesk.interfaces.security.RequireLogin;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/landlord")
@RequireLogin
@RequiredArgsConstructor
public class LandlordController {

  private final LandlordApplicationService landlord;

  @GetMapping("/rooms")
  List<RoomSummary> rooms() {
    return landlord.waitingRooms();
  }

  @PostMapping("/rooms")
  RoomView create() {
    return landlord.create(RequestIdentity.current().id());
  }

  @PostMapping("/rooms/{roomId}/join")
  RoomView join(@PathVariable String roomId) {
    return landlord.join(RequestIdentity.current().id(), roomId);
  }

  @PostMapping("/rooms/{roomId}/fill-bots")
  RoomView fillBots(@PathVariable String roomId) {
    return landlord.fillBots(RequestIdentity.current().id(), roomId);
  }

  @GetMapping("/rooms/{roomId}")
  RoomView room(@PathVariable String roomId) {
    return landlord.room(RequestIdentity.current().id(), roomId);
  }

  @PostMapping("/rooms/{roomId}/ready")
  RoomView ready(@PathVariable String roomId) {
    return landlord.ready(RequestIdentity.current().id(), roomId);
  }

  @PostMapping("/rooms/{roomId}/bid")
  RoomView bid(@PathVariable String roomId, @RequestBody BidRequest request) {
    return landlord.bid(RequestIdentity.current().id(), roomId, request.bid());
  }

  @PostMapping("/rooms/{roomId}/play")
  RoomView play(@PathVariable String roomId, @RequestBody PlayRequest request) {
    return landlord.play(RequestIdentity.current().id(), roomId, request.cards());
  }

  @PostMapping("/rooms/{roomId}/pass")
  RoomView pass(@PathVariable String roomId) {
    return landlord.pass(RequestIdentity.current().id(), roomId);
  }

  record BidRequest(int bid) {}

  record PlayRequest(List<String> cards) {}
}
